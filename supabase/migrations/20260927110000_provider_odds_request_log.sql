-- When we last asked the provider about a fixture's odds.
--
-- Distinct from when the provider says the market was observed, and distinct
-- from when we last stored something. The refresh scheduler needs "when did
-- we last spend a request on this fixture", and neither existing timestamp
-- answers it:
--
--   * `odds_observations.provider_observed_at` is the provider's own `update`
--     time, frequently hours in the past, so a fixture priced from it looks
--     permanently stale and is re-requested forever.
--   * `odds_observations.received_at` only advances when a row is actually
--     inserted -- and a re-request that returns unchanged prices inserts
--     nothing, because the content hash already exists. So the marker that
--     was supposed to stop the loop could only advance if the loop produced
--     new data, which is exactly the case it does not.
--
-- Both were observed live: seven consecutive passes each spent a provider
-- request on the same fixture and wrote nothing but duplicates. Asking is an
-- operational fact, so it is recorded on its own terms, whatever the response
-- turns out to contain.

create table if not exists operations.provider_odds_requests (
  provider_id uuid not null
    references operations.providers (id) on delete restrict,
  -- The provider's own fixture reference, so this is written straight after
  -- the call without first resolving an internal event id.
  provider_fixture_id text not null,
  last_requested_at timestamptz not null,
  request_count integer not null default 1,
  constraint provider_odds_requests_pkey
    primary key (provider_id, provider_fixture_id),
  constraint provider_odds_requests_count_check check (request_count > 0)
);

comment on table operations.provider_odds_requests is
  'Per-fixture record of when odds were last requested, advanced on every call regardless of what the response contained.';

create index if not exists provider_odds_requests_last_requested_idx
  on operations.provider_odds_requests (provider_id, last_requested_at desc);

alter table operations.provider_odds_requests enable row level security;
