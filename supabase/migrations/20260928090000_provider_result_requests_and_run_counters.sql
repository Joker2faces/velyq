-- Result ingestion: the per-fixture ask marker, and the run counters for it.
--
-- Additive only. Creates one table, adds six defaulted columns to an existing
-- one, and rewrites no data. Every statement is idempotent, so re-running the
-- migration on a database that already has it is a no-op.

-- ---------------------------------------------------------------- ask marker

-- When we last asked the provider about a fixture's result.
--
-- The same discipline as `provider_odds_requests`, for the same reason: the
-- only timestamp that correctly gates spending another request is the one
-- that advances when *we* act. The odds pass learned this the expensive way
-- -- seven consecutive passes, one request each, nothing written but
-- duplicates -- because it scheduled on the provider's own observation time.
--
-- `last_known_status` is cached here rather than re-read from
-- `intelligence.event_results` on every pass, and that is deliberate. A
-- fixture the provider refused, or one whose event identity could not be
-- resolved, has no `event_results` row at all. A status read only from there
-- cannot tell "not finished yet" apart from "we asked and could not use the
-- answer", and the second case must not re-ask every fifteen minutes against
-- a ten-request daily budget.
create table if not exists operations.provider_result_requests (
  provider_id uuid not null
    references operations.providers (id) on delete restrict,
  -- The provider's own fixture reference, so this is written straight after
  -- the call without first resolving an internal event id.
  provider_fixture_id text not null,
  last_requested_at timestamptz not null,
  request_count integer not null default 1,
  last_known_status text,
  constraint provider_result_requests_pkey
    primary key (provider_id, provider_fixture_id),
  constraint provider_result_requests_count_check check (request_count > 0),
  -- The same six states `intelligence.event_results` accepts. A seventh added
  -- in one place and not the other would surface as a constraint violation
  -- mid-transaction, which is why both lists are written out in full.
  constraint provider_result_requests_status_check check (
    last_known_status is null
    or last_known_status in (
      'SCHEDULED', 'IN_PROGRESS', 'FINAL',
      'POSTPONED', 'CANCELLED', 'ABANDONED'
    )
  )
);

comment on table operations.provider_result_requests is
  'Per-fixture record of when a result was last requested and what lifecycle state the provider last reported, advanced on every call regardless of what the response contained.';

create index if not exists provider_result_requests_last_requested_idx
  on operations.provider_result_requests (provider_id, last_requested_at desc);

alter table operations.provider_result_requests enable row level security;

-- ------------------------------------------------------------- run counters

-- The result pass reports the same shape of counts as the odds pass, so an
-- operator can answer "why is this match still unsettled?" from a run row
-- rather than from a database session.
--
-- Defaulted and not null: every historical run genuinely made zero result
-- requests, so zero is the correct value rather than a placeholder for
-- unknown.
alter table operations.provider_ingestion_runs
  add column if not exists result_candidates integer not null default 0,
  add column if not exists result_requests_attempted integer not null default 0,
  add column if not exists results_received integer not null default 0,
  add column if not exists results_written integer not null default 0,
  add column if not exists result_duplicates integer not null default 0,
  add column if not exists settlements_written integer not null default 0;

comment on column operations.provider_ingestion_runs.result_candidates is
  'Fixtures the scheduler judged worth a result request on this pass, before the batch ceiling.';
comment on column operations.provider_ingestion_runs.settlements_written is
  'intelligence.market_settlements rows written as a consequence of this pass.';
