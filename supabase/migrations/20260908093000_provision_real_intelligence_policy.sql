-- Provisions the policy rows the prediction pipeline cannot run without, and
-- registers Football-Data.co.uk as a second real provider.
--
-- Same defect class as 20260907124500, found the same way. The data quality
-- policy, the model definition and the EDGE and RADAR score definitions exist
-- only in `supabase/seed.sql`, which `db reset` applies after the migrations
-- and which a hosted project never applies at all. `DatabasePredictionJobHandler`
-- reads all three:
--
--   * no `data_quality_policy_versions` row -> ingestion cannot write an
--     assessment, so the handler throws QUALITY_ASSESSMENT_MISSING;
--   * no `score_definition_versions` row for RADAR -> the handler throws
--     RADAR_SCORE_DEFINITION_MISSING before it commits anything;
--   * no `model_definitions` row -> no model version can be registered at all.
--
-- So even with a trained model and a working trigger, production could not
-- have produced a single prediction. These are canonical policy rows, not
-- fixtures, and they belong in a migration.
--
-- Every statement is idempotent and additive. Nothing existing is modified.

-- ------------------------------------------------- data quality policy

-- The pre-event policy, distinct from the synthetic phase-one one rather than
-- a modification of it: policy versions are immutable evidence, and a
-- prediction that cites `quality.v1` must keep meaning what it meant.
--
-- `requiresLineup` stays true. A pre-event decision made a day before kickoff
-- genuinely cannot have a confirmed lineup, so this policy will grade such
-- markets down and the EDGE gate will refuse them — that is the existing
-- product policy working, not a bug to route around. Relaxing it would be
-- lowering a decision gate, which is out of scope here; the funnel reports
-- MISSING_LINEUP so the owner can see exactly where it stops.
insert into intelligence.data_quality_policy_versions (
  id, code, version, validation_status, definition, effective_from, created_at
)
values (
  '50000000-0000-4000-8000-000000000002',
  'REAL_PRE_EVENT_QUALITY',
  'quality.pre-event.v1',
  'DEVELOPMENT_HEURISTIC',
  '{"freshnessSeconds":86400,"minimumBookmakers":3,"requiresLineup":true,"weights":{"freshness":"1","priceCoverage":"1","bookmakerCoverage":"1","lineupCertainty":"1","mappingConfidence":"1","sourceAuthority":"1","consistency":"1"},"thresholds":{"gradeA":"6.5","gradeB":"5.5","gradeC":"4.5"}}'::jsonb,
  now(),
  now()
)
on conflict (code, version) do nothing;

-- ------------------------------------------------------ model definition

insert into intelligence.model_definitions (id, code, display_name, description, created_at)
values (
  '52000000-0000-4000-8000-000000000002',
  'FOOTBALL_DIXON_COLES',
  'Football Dixon-Coles goals model',
  'Bivariate Poisson goals model with the Dixon-Coles low-score dependence correction and exponential time decay. One coherent score distribution per match; full-time 1X2, over/under and both-teams-to-score are read off it as partitions of the same matrix so they cannot contradict each other.',
  now()
)
on conflict (code) do nothing;

-- ---------------------------------------------------- score definitions

-- `validation_status` is constrained to DEVELOPMENT_HEURISTIC, and correctly
-- so: these are weighted composites chosen by judgement, not fitted
-- quantities, and the product copy already describes them that way.
insert into intelligence.score_definition_versions (
  id, score_type, code, version, validation_status, definition, effective_from, created_at
)
values
  (
    '57000000-0000-4000-8000-000000000003',
    'EDGE',
    'REAL_PRE_EVENT_EDGE',
    'edge.pre-event.v1',
    'DEVELOPMENT_HEURISTIC',
    '{"weights":{"probabilityEdge":"2","expectedValue":"2","quality":"1"},"capsPenalties":{}}'::jsonb,
    now(),
    now()
  ),
  (
    '57000000-0000-4000-8000-000000000004',
    'RADAR',
    'REAL_PRE_EVENT_RADAR',
    'radar.pre-event.v1',
    'DEVELOPMENT_HEURISTIC',
    '{"weights":{"movement":"1","coverage":"1"},"capsPenalties":{}}'::jsonb,
    now(),
    now()
  )
on conflict (score_type, code, version) do nothing;

-- ------------------------------------------- Football-Data.co.uk provider

-- A second real provider, registered explicitly rather than folded into
-- API-Sports. It supplies two different things: the historical training corpus
-- (in the `research` schema) and a feed of upcoming fixtures with pre-event
-- prices. Source identity has to stay separable or no claim about "our data"
-- is traceable.
--
-- The policy grants RETAIN_NORMALIZED and no DISPLAY grant. That is
-- deliberate: the publisher documents its schema but states no licence and
-- grants no redistribution permission, so internal model training is treated
-- as in scope and serving its data to customers is not, pending an owner
-- decision. Attribution is required either way.
insert into operations.providers (id, code, display_name, is_synthetic, created_at)
values (
  '30000000-0000-4000-8000-000000000003',
  'FOOTBALL_DATA_UK',
  'Football-Data.co.uk',
  false,
  now()
)
on conflict (code) do nothing;

insert into operations.provider_policy_versions (
  id, provider_id, version, policy, effective_from, created_at
)
select
  '31000000-0000-4000-8000-000000000003',
  p.id,
  'football-data.v1',
  '{"providerCode":"FOOTBALL_DATA_UK","version":"football-data.v1","providerMode":"REAL","effectiveFrom":"2026-09-08T00:00:00Z","effectiveTo":null,"grants":[{"action":"RETAIN_NORMALIZED","environments":["PRODUCTION","STAGING","DEVELOPMENT","TEST"],"dataCategories":["NORMALIZED_FIXTURE","NORMALIZED_ODDS"],"requiredAttribution":true,"retentionDays":3650}]}'::jsonb,
  now(),
  now()
from operations.providers p
where p.code = 'FOOTBALL_DATA_UK'
on conflict (provider_id, version) do nothing;

-- Its division codes map onto the same canonical market definitions the
-- API-Sports mappings use, so one market identity serves both providers.
insert into market.provider_market_mappings (
  id, provider_id, provider_market_key, provider_outcome_key,
  market_definition_id, outcome_definition_id, mapping_version, effective_from, created_at
)
select
  entry.id::uuid,
  p.id,
  entry.market_key,
  entry.outcome_key,
  entry.market_definition_id::uuid,
  entry.outcome_definition_id::uuid,
  'football-data.v1',
  now(),
  now()
from operations.providers p
cross join (
  values
    ('42000000-0000-4000-8000-000000000019', 'ft_1x2', 'HOME', '40000000-0000-4000-8000-000000000001', '41000000-0000-4000-8000-000000000001'),
    ('42000000-0000-4000-8000-000000000020', 'ft_1x2', 'DRAW', '40000000-0000-4000-8000-000000000001', '41000000-0000-4000-8000-000000000002'),
    ('42000000-0000-4000-8000-000000000021', 'ft_1x2', 'AWAY', '40000000-0000-4000-8000-000000000001', '41000000-0000-4000-8000-000000000003'),
    ('42000000-0000-4000-8000-000000000022', 'ft_total_2_5', 'OVER', '40000000-0000-4000-8000-000000000002', '41000000-0000-4000-8000-000000000004'),
    ('42000000-0000-4000-8000-000000000023', 'ft_total_2_5', 'UNDER', '40000000-0000-4000-8000-000000000002', '41000000-0000-4000-8000-000000000005')
) as entry (id, market_key, outcome_key, market_definition_id, outcome_definition_id)
where p.code = 'FOOTBALL_DATA_UK'
on conflict (id) do nothing;
