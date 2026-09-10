-- Lineup ingestion: the per-fixture ask marker, and the run counters for it.
--
-- Additive only. One table, six defaulted columns on an existing one, no data
-- rewritten, every statement idempotent.

-- ---------------------------------------------------------------- ask marker

-- When we last asked the provider about a fixture's lineup.
--
-- The third marker table of this shape, and for the third time the same
-- reason: the only timestamp that correctly gates spending another request is
-- the one that advances when *we* act. Scheduling on the provider's own
-- observation instant instead is what made the odds pass spend seven
-- consecutive requests on one fixture and write nothing but duplicates.
--
-- `last_known_status` carries more weight here than for results, because the
-- terminal state is narrower. Only OFFICIAL ends a fixture's cost. EXPECTED
-- and UNAVAILABLE both mean keep asking: a provisional sheet is exactly what
-- the confirmed one must replace, and it is also the state in which the
-- WAIT_FOR_LINEUP gate stays closed -- so treating it as an answer would both
-- stop us asking and leave the gate shut for good.
create table if not exists operations.provider_lineup_requests (
  provider_id uuid not null
    references operations.providers (id) on delete restrict,
  -- The provider's own fixture reference, so this is written straight after
  -- the call without first resolving an internal event id.
  provider_fixture_id text not null,
  last_requested_at timestamptz not null,
  request_count integer not null default 1,
  last_known_status text,
  constraint provider_lineup_requests_pkey
    primary key (provider_id, provider_fixture_id),
  constraint provider_lineup_requests_count_check check (request_count > 0),
  -- The same three states `intelligence.lineup_observations` accepts. Both
  -- lists are written out in full because a fourth added in one place and not
  -- the other surfaces as a constraint violation mid-transaction.
  constraint provider_lineup_requests_status_check check (
    last_known_status is null
    or last_known_status in ('EXPECTED', 'OFFICIAL', 'UNAVAILABLE')
  )
);

comment on table operations.provider_lineup_requests is
  'Per-fixture record of when a lineup was last requested and the best state the provider has reported, advanced on every call regardless of what the response contained.';

create index if not exists provider_lineup_requests_last_requested_idx
  on operations.provider_lineup_requests (provider_id, last_requested_at desc);

alter table operations.provider_lineup_requests enable row level security;

-- ------------------------------------------------------------- run counters

-- So an operator can answer "why is this match still waiting on a lineup?"
-- from a run row rather than a database session. WAIT_FOR_LINEUP is the most
-- common reason a fixture produces no actionable decision, and "the window
-- has not opened" is a different answer from "we asked and the provider had
-- nothing".
--
-- Defaulted and not null: every historical run genuinely made zero lineup
-- requests, so zero is correct rather than a placeholder for unknown.
alter table operations.provider_ingestion_runs
  add column if not exists lineup_candidates integer not null default 0,
  add column if not exists lineup_requests_attempted integer not null default 0,
  add column if not exists lineups_received integer not null default 0,
  add column if not exists lineups_written integer not null default 0,
  add column if not exists lineup_duplicates integer not null default 0,
  add column if not exists lineups_official integer not null default 0;

comment on column operations.provider_ingestion_runs.lineups_official is
  'Fixtures whose starting eleven became complete on this pass, so the WAIT_FOR_LINEUP gate can clear.';
