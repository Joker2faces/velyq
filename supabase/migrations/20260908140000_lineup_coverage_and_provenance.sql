-- Lineup coverage discovery, and the provenance a lineup observation needs to
-- be worth storing.
--
-- Two additions, both driven by the same finding: treating "no lineup" as one
-- boolean made a market a day before kickoff indistinguishable from a
-- competition that will never publish an XI, and from a fixture whose XI is
-- twenty minutes overdue. Those three call for three different behaviours.

-- ------------------------------------------------- provider coverage flags

-- What the provider says it can supply for a league and season.
--
-- Cached deliberately. The free plan allows 100 requests a day across every
-- endpoint, and asking a league with `lineups = false` for a lineup is a
-- request wasted permanently rather than just now — no amount of waiting
-- changes the answer. One `/leagues?current=true` call fills this for every
-- league at once.
create table if not exists catalog.competition_provider_coverage (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references operations.providers (id) on delete restrict,
  provider_league_id text not null,
  league_name text not null,
  country_name text,
  country_code char(2),
  season integer not null,
  is_current boolean not null,
  -- The flag the lineup scheduler acts on. Nullable is not offered: an
  -- unknown coverage state is represented by the absence of the row, which
  -- the scheduler treats as "ask once" rather than as either extreme.
  lineups boolean not null,
  odds boolean not null,
  predictions boolean not null,
  injuries boolean not null,
  statistics boolean not null,
  observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint competition_provider_coverage_identity_unique
    unique (provider_id, provider_league_id, season),
  constraint competition_provider_coverage_season_check
    check (season between 1900 and 2100)
);

create index if not exists competition_provider_coverage_current_idx
  on catalog.competition_provider_coverage (provider_id, is_current);

-- ----------------------------------------------- lineup observation detail

-- The provider's own fixture id, so a stored lineup can be traced back to the
-- exact request that produced it without going through the catalog event.
alter table intelligence.lineup_observations
  add column if not exists provider_fixture_id text;

-- The coach, where the provider supplies one. A managerial change is one of
-- the few pre-match facts that plausibly moves a price, and it is not
-- recoverable from the player list.
alter table intelligence.lineup_observations
  add column if not exists coach_name text;
alter table intelligence.lineup_observations
  add column if not exists provider_coach_id text;

-- Counts alongside the jsonb, so "is this a complete XI" is answerable in a
-- query rather than only by parsing every row. A one-sided or short lineup is
-- not a lineup for decision purposes, and the pipeline has to be able to
-- filter on that cheaply.
alter table intelligence.lineup_observations
  add column if not exists starters smallint;
alter table intelligence.lineup_observations
  add column if not exists substitutes smallint;

do $$
begin
  alter table intelligence.lineup_observations
    add constraint lineup_observations_squad_counts_check
    check (
      (starters is null or starters between 0 and 30)
      and (substitutes is null or substitutes between 0 and 30)
    );
exception
  when duplicate_object then null;
end
$$;

create index if not exists lineup_observations_provider_fixture_idx
  on intelligence.lineup_observations (provider_fixture_id);

-- --------------------------------------------- lineup request bookkeeping

-- When each fixture's lineup was last asked for, and what came back.
--
-- Without this the scheduler cannot honour a recheck interval, and polling
-- inside the priority window would spend a request a minute to learn the same
-- thing repeatedly. It also records the availability the request resolved to,
-- which is what lets the decision policy tell a pending lineup from an
-- uncovered competition without re-deriving it.
create table if not exists operations.lineup_request_log (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references catalog.events (id) on delete restrict,
  provider_id uuid not null references operations.providers (id) on delete restrict,
  provider_fixture_id text not null,
  requested_at timestamptz not null,
  availability text not null,
  minutes_to_kickoff integer not null,
  poll_window text not null,
  teams_returned smallint not null,
  created_at timestamptz not null default now(),
  constraint lineup_request_log_availability_check
    check (
      availability in (
        'LINEUP_AVAILABLE',
        'LINEUP_NOT_PUBLISHED_YET',
        'LINEUP_NOT_COVERED'
      )
    ),
  constraint lineup_request_log_window_check
    check (
      poll_window in (
        'OUTSIDE_WINDOW',
        'OCCASIONAL',
        'POLLING',
        'PRIORITY',
        'KICKED_OFF'
      )
    )
);

create index if not exists lineup_request_log_event_requested_idx
  on operations.lineup_request_log (event_id, requested_at desc);

-- --------------------------------------------------------------- security

-- Same posture as every other internal table: server-side only.
revoke all on table catalog.competition_provider_coverage from anon, authenticated;
revoke all on table operations.lineup_request_log from anon, authenticated;

grant select, insert, update, delete
  on table catalog.competition_provider_coverage to service_role;
grant select, insert, update, delete
  on table operations.lineup_request_log to service_role;

-- The request log is evidence of what was asked and when, so it is
-- append-only for the same reason the observation history is: a log that can
-- be rewritten cannot explain a decision that cited it.
create trigger reject_operations_lineup_request_log_mutation
before update or delete on operations.lineup_request_log
for each row execute function private.reject_append_only_mutation();
