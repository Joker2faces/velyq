-- Historical research corpus, competition eligibility policy, model artifacts
-- and the decision funnel.
--
-- Four separate concerns, one migration because they are one architectural
-- move: the model can only exist if there is a corpus to train it on, it can
-- only be trusted if the artifact is immutable and fingerprinted, it can only
-- be pointed at the right events if competition eligibility is data rather
-- than a hardcoded list, and the owner can only understand a day with no
-- recommendation if the funnel counts are persisted.
--
-- The corpus deliberately does NOT go into catalog.events / market.*. Those
-- tables are the operational record of events VELYQ tracks live, with provider
-- run lineage and append-only observation history attached. Historical
-- training rows are a different thing with a different provenance model and a
-- different lifecycle, and mixing them would make "how many events do we
-- cover" unanswerable and every operational query filter-dependent.

create schema if not exists research;

-- ---------------------------------------------------------------- provenance

create table if not exists research.data_sources (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  display_name text not null,
  source_url text not null,
  schema_notes_url text not null,
  -- Whether a human still has to read the publisher's terms before the data
  -- may be used beyond internal training. Internal model training and public
  -- redistribution are separate questions and this answers neither on its
  -- own; it records that the question is open.
  terms_review text not null,
  terms_note text not null,
  -- A source whose only prices are post-match is evaluation data, never
  -- decision input, and the backtest reads this to know which it has.
  pre_event_prices_available boolean not null,
  created_at timestamptz not null default now(),
  constraint data_sources_code_unique unique (code),
  constraint data_sources_terms_review_check
    check (terms_review in ('PASS', 'NEEDS_OWNER_REVIEW'))
);

create table if not exists research.imports (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references research.data_sources (id) on delete restrict,
  import_version text not null,
  source_uri text not null,
  source_division text not null,
  source_season text not null,
  season_label text not null,
  canonical_competition_code text not null,
  content_sha256 text not null,
  downloaded_at timestamptz not null,
  imported_at timestamptz not null default now(),
  -- Football-Data replaced its Betbrain aggregate columns with market
  -- Avg/Max columns from 2019/20, and only the later family carries closing
  -- prices. Recording which family a file used keeps a backtest honest about
  -- which seasons could have had a closing-line comparison at all.
  odds_column_family text not null,
  closing_prices_available boolean not null,
  rows_raw integer not null,
  rows_accepted integer not null,
  rows_rejected integer not null,
  rows_unplayed integer not null,
  constraint imports_odds_column_family_check
    check (odds_column_family in ('BETBRAIN', 'MARKET_AVERAGE', 'NONE')),
  constraint imports_row_counts_check
    check (rows_raw >= 0 and rows_accepted >= 0 and rows_rejected >= 0 and rows_unplayed >= 0),
  -- Identified by content, so re-importing an unchanged file is a no-op and
  -- re-importing a corrected one is a new import rather than a silent
  -- overwrite of the rows the model was trained on.
  constraint imports_identity_unique
    unique (source_id, source_division, source_season, content_sha256)
);

create index if not exists imports_source_id_idx on research.imports (source_id);
create index if not exists imports_competition_season_idx
  on research.imports (canonical_competition_code, source_season);

-- ------------------------------------------------------------------- corpus

create table if not exists research.matches (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references research.imports (id) on delete restrict,
  canonical_competition_code text not null,
  season_label text not null,
  kickoff_date date not null,
  kickoff_time time,
  -- The publisher's own spelling is kept alongside the normalized key so a
  -- mapping dispute can always be traced back to what the source actually
  -- said, rather than to what normalization made of it.
  source_home_name text not null,
  source_away_name text not null,
  home_team_key text not null,
  away_team_key text not null,
  home_goals smallint not null,
  away_goals smallint not null,
  half_time_home_goals smallint,
  half_time_away_goals smallint,
  mapping_status text not null,
  created_at timestamptz not null default now(),
  constraint matches_goals_check
    check (home_goals between 0 and 30 and away_goals between 0 and 30),
  constraint matches_half_time_goals_check
    check (
      (half_time_home_goals is null or half_time_home_goals between 0 and 30)
      and (half_time_away_goals is null or half_time_away_goals between 0 and 30)
    ),
  constraint matches_mapping_status_check
    check (mapping_status in ('RESOLVED', 'QUARANTINED')),
  constraint matches_teams_distinct_check check (home_team_key <> away_team_key),
  -- One match per competition, date and team pair. This is what makes a
  -- re-import idempotent and what makes a duplicated source row impossible to
  -- train on twice.
  constraint matches_identity_unique
    unique (canonical_competition_code, kickoff_date, home_team_key, away_team_key)
);

create index if not exists matches_import_id_idx on research.matches (import_id);
create index if not exists matches_competition_kickoff_idx
  on research.matches (canonical_competition_code, kickoff_date);
create index if not exists matches_home_team_idx
  on research.matches (canonical_competition_code, home_team_key);
create index if not exists matches_away_team_idx
  on research.matches (canonical_competition_code, away_team_key);

create table if not exists research.match_odds (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references research.matches (id) on delete restrict,
  market_code text not null,
  outcome_code text not null,
  line numeric(6, 2),
  -- The distinction the whole backtest rests on. PRE_CLOSING prices are
  -- collected days before kickoff and are legitimate decision inputs; CLOSING
  -- prices are the last thing the market knew and are evaluation data only.
  -- Using a closing price to make a historical decision is looking at the
  -- answer.
  price_phase text not null,
  price_scope text not null,
  bookmaker_code text,
  decimal_odds numeric(12, 4) not null,
  created_at timestamptz not null default now(),
  constraint match_odds_price_phase_check
    check (price_phase in ('PRE_CLOSING', 'CLOSING')),
  constraint match_odds_price_scope_check
    check (price_scope in ('AVERAGE', 'MAXIMUM', 'BOOKMAKER')),
  -- A panel aggregate has no bookmaker; an individual price must name one.
  constraint match_odds_bookmaker_scope_check
    check (
      (price_scope = 'BOOKMAKER' and bookmaker_code is not null)
      or (price_scope <> 'BOOKMAKER' and bookmaker_code is null)
    ),
  constraint match_odds_decimal_odds_check
    check (decimal_odds::text not in ('NaN', 'Infinity', '-Infinity') and decimal_odds > 1)
);

create unique index if not exists match_odds_identity_unique
  on research.match_odds (
    match_id,
    market_code,
    outcome_code,
    coalesce(line, -1),
    price_phase,
    price_scope,
    coalesce(bookmaker_code, '-')
  );
create index if not exists match_odds_market_phase_idx
  on research.match_odds (market_code, price_phase, price_scope);

create table if not exists research.mapping_quarantine (
  id uuid primary key default gen_random_uuid(),
  import_id uuid references research.imports (id) on delete restrict,
  canonical_competition_code text,
  reason_code text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  constraint mapping_quarantine_payload_object_check
    check (jsonb_typeof(payload) = 'object')
);

create index if not exists mapping_quarantine_import_id_idx
  on research.mapping_quarantine (import_id);

-- ------------------------------------------------- competition eligibility

-- Nullable on purpose: an event whose competition has no canonical mapping is
-- not an error, it is a competition with no policy. It stays in the catalog,
-- stays visible in admin, and is ineligible for customer intelligence because
-- the resolver fails closed rather than guessing.
alter table catalog.competitions add column if not exists canonical_code text;
create index if not exists competitions_canonical_code_idx
  on catalog.competitions (canonical_code);

create table if not exists catalog.competition_policy_versions (
  id uuid primary key default gen_random_uuid(),
  version text not null,
  definition jsonb not null,
  effective_from timestamptz not null,
  created_at timestamptz not null default now(),
  constraint competition_policy_versions_version_unique unique (version),
  constraint competition_policy_versions_definition_object_check
    check (jsonb_typeof(definition) = 'object')
);

create table if not exists catalog.competition_policies (
  id uuid primary key default gen_random_uuid(),
  policy_version_id uuid not null
    references catalog.competition_policy_versions (id) on delete restrict,
  sport_id uuid not null references catalog.sports (id) on delete restrict,
  canonical_code text not null,
  display_name text not null,
  country_code char(2),
  tier smallint not null,
  state text not null,
  model_eligible boolean not null,
  customer_visible boolean not null,
  min_historical_sample integer not null,
  min_bookmaker_coverage integer not null,
  -- An administrator can narrow eligibility but never widen it past the
  -- evidence: widening would be a way to publish an unvalidated model through
  -- a configuration change, which is exactly what the maturity policy exists
  -- to prevent. The narrowing rule is enforced in application code, which is
  -- where the evidence being compared against actually lives.
  manual_override text,
  override_reason text,
  reason_codes text[] not null,
  created_at timestamptz not null default now(),
  constraint competition_policies_state_check
    check (state in ('PRIME', 'SUPPORTED', 'EXPERIMENTAL', 'ADMIN_ONLY', 'EXCLUDED')),
  constraint competition_policies_manual_override_check
    check (
      manual_override is null
      or manual_override in ('PRIME', 'SUPPORTED', 'EXPERIMENTAL', 'ADMIN_ONLY', 'EXCLUDED')
    ),
  constraint competition_policies_override_reason_check
    check (manual_override is null or override_reason is not null),
  -- A competition that is not customer-visible cannot be model-eligible: the
  -- only reason to run inference on it is to show it to someone.
  constraint competition_policies_visibility_check
    check (customer_visible or not model_eligible),
  constraint competition_policies_thresholds_check
    check (min_historical_sample >= 0 and min_bookmaker_coverage >= 0),
  constraint competition_policies_identity_unique
    unique (policy_version_id, canonical_code)
);

create index if not exists competition_policies_canonical_code_idx
  on catalog.competition_policies (canonical_code);
create index if not exists competition_policies_sport_id_idx
  on catalog.competition_policies (sport_id);

-- The bridge between a provider's own competition key and the canonical code
-- the policy is written against. Provider names are ambiguous across countries
-- ("Premier League" exists in a dozen of them), so a provider key resolves
-- only through an explicit row here.
create table if not exists catalog.competition_identities (
  id uuid primary key default gen_random_uuid(),
  canonical_code text not null,
  source_code text not null,
  source_key text not null,
  source_name text not null,
  country_code char(2),
  created_at timestamptz not null default now(),
  constraint competition_identities_identity_unique unique (source_code, source_key)
);

create index if not exists competition_identities_canonical_code_idx
  on catalog.competition_identities (canonical_code);

-- ---------------------------------------------------- model artifacts

-- Production inference loads one of these and nothing else. A model refitted
-- on demand cannot reproduce the prediction it made last Tuesday and so
-- cannot be audited; everything needed to reproduce a probability travels
-- together here.
create table if not exists intelligence.model_artifacts (
  id uuid primary key default gen_random_uuid(),
  model_version_id uuid not null
    references intelligence.model_versions (id) on delete restrict,
  artifact_reference text not null,
  training_dataset_fingerprint text not null,
  training_cutoff timestamptz not null,
  parameters jsonb not null,
  calibrators jsonb not null,
  uncertainty_profiles jsonb not null,
  validation_report jsonb not null,
  created_at timestamptz not null default now(),
  constraint model_artifacts_artifact_reference_unique unique (artifact_reference),
  constraint model_artifacts_model_version_unique unique (model_version_id),
  constraint model_artifacts_parameters_object_check
    check (jsonb_typeof(parameters) = 'object'),
  constraint model_artifacts_calibrators_array_check
    check (jsonb_typeof(calibrators) = 'array'),
  constraint model_artifacts_uncertainty_array_check
    check (jsonb_typeof(uncertainty_profiles) = 'array'),
  constraint model_artifacts_validation_report_object_check
    check (jsonb_typeof(validation_report) = 'object')
);

-- ---------------------------------------------------- decision funnel

-- Why there is no recommendation today, in counts rather than in prose. This
-- is the table that distinguishes "the model evaluated the qualifying events
-- and none cleared the gates" from "no prediction was ever generated" — the
-- two are indistinguishable from an empty recommendations list, and only one
-- of them is a bug.
create table if not exists intelligence.decision_funnel_runs (
  id uuid primary key default gen_random_uuid(),
  sport_code text not null,
  as_of timestamptz not null,
  horizon_hours integer not null,
  model_version_id uuid references intelligence.model_versions (id) on delete restrict,
  counts jsonb not null,
  no_bet_reasons jsonb not null,
  trigger_source text not null,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  constraint decision_funnel_runs_idempotency_key_unique unique (idempotency_key),
  constraint decision_funnel_runs_counts_object_check
    check (jsonb_typeof(counts) = 'object'),
  constraint decision_funnel_runs_no_bet_reasons_object_check
    check (jsonb_typeof(no_bet_reasons) = 'object'),
  constraint decision_funnel_runs_horizon_check check (horizon_hours > 0),
  constraint decision_funnel_runs_trigger_source_check
    check (trigger_source in ('SCHEDULED', 'ADMIN', 'CLI'))
);

create index if not exists decision_funnel_runs_sport_as_of_idx
  on intelligence.decision_funnel_runs (sport_code, as_of desc);

-- --------------------------------------------------------------- security

-- Same posture as every other internal schema: server-side only. The browser
-- roles must not be able to enumerate the training corpus, the eligibility
-- policy, the model parameters or the funnel through PostgREST.
revoke all on schema research from anon, authenticated;
revoke all on all tables in schema research from anon, authenticated;
revoke all on all sequences in schema research from anon, authenticated;
alter default privileges in schema research revoke all on tables from anon, authenticated;
alter default privileges in schema research revoke all on sequences from anon, authenticated;
alter default privileges in schema research revoke all on functions from public, anon, authenticated;

revoke all on table catalog.competition_policy_versions from anon, authenticated;
revoke all on table catalog.competition_policies from anon, authenticated;
revoke all on table catalog.competition_identities from anon, authenticated;
revoke all on table intelligence.model_artifacts from anon, authenticated;
revoke all on table intelligence.decision_funnel_runs from anon, authenticated;

grant usage on schema research to service_role;
grant select, insert, update, delete on all tables in schema research to service_role;
grant usage, select on all sequences in schema research to service_role;
alter default privileges in schema research
  grant select, insert, update, delete on tables to service_role;
alter default privileges in schema research grant usage, select on sequences to service_role;

grant select, insert, update, delete on table catalog.competition_policy_versions to service_role;
grant select, insert, update, delete on table catalog.competition_policies to service_role;
grant select, insert, update, delete on table catalog.competition_identities to service_role;
grant select, insert, update, delete on table intelligence.model_artifacts to service_role;
grant select, insert, update, delete on table intelligence.decision_funnel_runs to service_role;

-- Model artifacts and funnel runs are evidence, so they are append-only for
-- the same reason predictions are: an artifact that can be edited after a
-- prediction cited it makes that prediction unexplainable.
create trigger reject_intelligence_model_artifacts_mutation
before update or delete on intelligence.model_artifacts
for each row execute function private.reject_append_only_mutation();

create trigger reject_intelligence_decision_funnel_runs_mutation
before update or delete on intelligence.decision_funnel_runs
for each row execute function private.reject_append_only_mutation();

create trigger reject_research_matches_mutation
before delete on research.matches
for each row execute function private.reject_append_only_mutation();

create trigger reject_research_match_odds_mutation
before delete on research.match_odds
for each row execute function private.reject_append_only_mutation();
