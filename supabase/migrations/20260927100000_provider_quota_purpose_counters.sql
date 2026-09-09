-- Per-purpose provider spend counters, written per call rather than per run.
--
-- The first live ingestion pass was killed by the executor's wall-clock limit
-- after its provider calls had already been made but before its run record
-- was written. The quota *remaining* figure survived, because it is recorded
-- immediately after each call, but the per-purpose spend was derived from the
-- run log -- so five spent requests left no trace in the discovery/odds
-- budgets, and the next pass would have believed those budgets untouched.
--
-- Budget accounting must not depend on a run finishing. These counters live
-- alongside the remaining figure and are incremented in the same write, so a
-- request that was made is a request that is counted, whatever happens to the
-- invocation afterwards.

alter table operations.provider_quota_state
  add column if not exists discovery_requests integer not null default 0,
  add column if not exists odds_requests integer not null default 0,
  add column if not exists lineup_requests integer not null default 0,
  add column if not exists result_requests integer not null default 0;

alter table operations.provider_quota_state
  drop constraint if exists provider_quota_state_purpose_counters_check;

alter table operations.provider_quota_state
  add constraint provider_quota_state_purpose_counters_check check (
    discovery_requests >= 0
    and odds_requests >= 0
    and lineup_requests >= 0
    and result_requests >= 0
  );

comment on column operations.provider_quota_state.discovery_requests is
  'Fixture-list requests spent this quota day; incremented per call, not per completed run.';
