-- Provider quota state and live ingestion run records.
--
-- The API-Sports plan allows roughly 100 requests per UTC day. Two things
-- follow, and neither had anywhere to live before this migration.
--
-- First, quota has to be *remembered*. The remaining count arrives only in
-- provider response headers, so a pipeline that does not persist it has no
-- way to know its own budget without spending a request to ask -- and on a
-- 100-request day, inspecting the budget on every scheduler wake-up would
-- consume a meaningful fraction of it. `provider_quota_state` keeps one row
-- per (provider, UTC quota day) so any number of stateless invocations share
-- one view of what is left.
--
-- Second, `operations.provider_sync_runs` cannot record these runs. It is
-- shaped for deterministic replay -- `replay_sequence`, `content_hash`, a
-- mandatory `policy_version_id`, and a uniqueness rule over
-- (provider, replay_sequence, started_at) -- none of which describes a live
-- provider poll that may legitimately make zero requests. Overloading it
-- would blur replay provenance with live operations, so live runs get their
-- own table.

create table if not exists operations.provider_quota_state (
  provider_id uuid not null
    references operations.providers (id) on delete restrict,
  -- Quota resets at UTC midnight, so the day is part of the key rather than
  -- a column that has to be reset by something.
  quota_day date not null,
  -- Both nullable: the provider does not always report them, and inventing a
  -- number here would be worse than admitting it is unknown. The quota policy
  -- treats null as UNKNOWN, which is deliberately distinct from EXHAUSTED.
  daily_limit integer,
  remaining integer,
  requests_used integer not null default 0,
  last_observed_at timestamptz,
  last_provider_call_at timestamptz,
  -- Denormalised classification, written by the application so operators and
  -- SQL readers see the same state the pipeline acted on.
  policy_state text not null,
  policy_version text not null,
  updated_at timestamptz not null default now(),
  constraint provider_quota_state_pkey primary key (provider_id, quota_day),
  constraint provider_quota_state_policy_state_check check (
    policy_state in ('HEALTHY', 'CONSERVE', 'CRITICAL', 'EXHAUSTED', 'UNKNOWN')
  ),
  constraint provider_quota_state_remaining_check check (
    remaining is null or remaining >= 0
  ),
  constraint provider_quota_state_daily_limit_check check (
    daily_limit is null or daily_limit > 0
  ),
  constraint provider_quota_state_requests_used_check check (
    requests_used >= 0
  )
);

comment on table operations.provider_quota_state is
  'Remembered provider quota per UTC day, so checking the budget never costs a request.';

create table if not exists operations.provider_ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null
    references operations.providers (id) on delete restrict,
  -- SCHEDULER for a Supabase Cron wake-up, MANUAL for an operator-triggered
  -- run. Kept because a thin run means very different things in each case.
  trigger text not null,
  quota_day date not null,
  quota_policy_version text not null,
  started_at timestamptz not null,
  finished_at timestamptz,
  status text not null,
  -- Provider cost accounting. `provider_calls_used` is the number that
  -- matters against the daily budget; zero is the expected value for a
  -- wake-up with no work due, not a failure.
  provider_calls_used integer not null default 0,
  quota_state_at_start text,
  quota_state_at_end text,
  quota_remaining_at_end integer,
  discovery_dates_requested text[] not null default '{}',
  fixtures_received integer not null default 0,
  fixtures_written integer not null default 0,
  odds_candidates integer not null default 0,
  odds_requests_attempted integer not null default 0,
  odds_observations_received integer not null default 0,
  odds_observations_written integer not null default 0,
  odds_duplicates integer not null default 0,
  -- Why work did not happen, and what failed. Structured so the admin funnel
  -- view can answer "why is Today empty" without anyone writing SQL.
  skipped_by_reason jsonb not null default '{}'::jsonb,
  errors_by_reason jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint provider_ingestion_runs_trigger_check check (
    trigger in ('SCHEDULER', 'MANUAL')
  ),
  constraint provider_ingestion_runs_status_check check (
    status in ('RUNNING', 'COMPLETED', 'FAILED')
  ),
  constraint provider_ingestion_runs_calls_check check (
    provider_calls_used >= 0
  )
);

comment on table operations.provider_ingestion_runs is
  'One row per live provider ingestion pass, including passes that correctly made no provider calls.';

create index if not exists provider_ingestion_runs_provider_started_idx
  on operations.provider_ingestion_runs (provider_id, started_at desc);

create index if not exists provider_ingestion_runs_quota_day_idx
  on operations.provider_ingestion_runs (quota_day, started_at desc);

-- Both tables are operational: reachable only by the privileged server role
-- that runs ingestion, never by an end user's session.
alter table operations.provider_quota_state enable row level security;
alter table operations.provider_ingestion_runs enable row level security;
