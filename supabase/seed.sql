-- Deterministic local-only identities. These users have no passwords and cannot sign in.
INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
VALUES
  ('00000000-0000-4000-8000-000000000001', 'owner@velyq.local', '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-4000-8000-000000000002', 'other@velyq.local', '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-4000-8000-000000000003', 'admin@velyq.local', '{}'::jsonb, '{}'::jsonb);

INSERT INTO public.profiles (user_id, display_name, locale, timezone)
VALUES
  ('00000000-0000-4000-8000-000000000001', 'Synthetic Owner', 'en', 'UTC'),
  ('00000000-0000-4000-8000-000000000002', 'Synthetic Other User', 'en', 'UTC'),
  ('00000000-0000-4000-8000-000000000003', 'Synthetic Administrator', 'en', 'UTC');

INSERT INTO private.roles (id, code, description)
VALUES
  ('10000000-0000-4000-8000-000000000001', 'USER', 'Standard authenticated user'),
  ('10000000-0000-4000-8000-000000000002', 'ADMIN', 'VELYQ operations administrator');

INSERT INTO private.permissions (id, code, description)
VALUES
  ('11000000-0000-4000-8000-000000000001', 'admin.access', 'Access the admin application'),
  ('11000000-0000-4000-8000-000000000002', 'provider_runs.read', 'Read provider run traces'),
  ('11000000-0000-4000-8000-000000000003', 'predictions.trace', 'Read prediction lineage'),
  ('11000000-0000-4000-8000-000000000004', 'scores.inspect', 'Inspect score evidence'),
  ('11000000-0000-4000-8000-000000000005', 'quality.inspect', 'Inspect quality assessments'),
  ('11000000-0000-4000-8000-000000000006', 'audit.read', 'Read administrator audit events');

INSERT INTO private.role_permissions (role_id, permission_id)
SELECT '10000000-0000-4000-8000-000000000002'::uuid, id
FROM private.permissions;

INSERT INTO private.user_roles (user_id, role_id, granted_by)
VALUES
  ('00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003'),
  ('00000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003'),
  ('00000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003'),
  ('00000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003');

INSERT INTO catalog.sports (id, code, name_key)
VALUES ('20000000-0000-4000-8000-000000000001', 'FOOTBALL', 'sport.football');

INSERT INTO catalog.competitions (id, sport_id, code, name_key, country_code)
VALUES (
  '21000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'SYNTHETIC_LEAGUE',
  'competition.synthetic_league',
  'ZZ'
);

INSERT INTO catalog.participants (id, sport_id, type, code, display_name)
VALUES
  ('22000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'TEAM', 'NORTH_CITY', 'North City (Synthetic)'),
  ('22000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'TEAM', 'SOUTH_UNITED', 'South United (Synthetic)');

INSERT INTO catalog.events (id, sport_id, competition_id, season_label, starts_at, status, synthetic)
VALUES (
  '23000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000001',
  'Synthetic 2026',
  '2026-09-03T18:00:00Z',
  'SCHEDULED',
  true
);

INSERT INTO catalog.event_participants (event_id, participant_id, role)
VALUES
  ('23000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000001', 'HOME'),
  ('23000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000002', 'AWAY');

INSERT INTO operations.providers (id, code, display_name, is_synthetic)
VALUES (
  '30000000-0000-4000-8000-000000000001',
  'SYNTHETIC_FIXTURES',
  'VELYQ Synthetic Fixtures',
  true
);

INSERT INTO operations.provider_policy_versions (
  id,
  provider_id,
  version,
  policy,
  effective_from
)
VALUES (
  '31000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'synthetic-fixtures.v1',
  '{"providerMode":"SYNTHETIC","retainRaw":false,"retainNormalized":true,"displayAudiences":["CUSTOMER","ADMIN"],"redistribute":false,"modelTraining":false,"backtesting":true,"replay":true}'::jsonb,
  '2026-01-01T00:00:00Z'
);

INSERT INTO operations.provider_sync_runs (
  id,
  provider_id,
  capability,
  status,
  replay_sequence,
  fixture_path,
  content_hash,
  provider_schema_version,
  normalization_version,
  mapping_version,
  policy_version_id,
  started_at,
  completed_at,
  received_count,
  accepted_count,
  rejected_count
)
VALUES (
  '32000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'SYNTHETIC_REPLAY',
  'COMPLETED',
  'canonical-sequence.v1',
  'packages/providers/src/mock/fixtures/v1',
  'sha256:synthetic-run-v1',
  'provider.v1',
  'normalization.v1',
  'mapping.v1',
  '31000000-0000-4000-8000-000000000001',
  '2026-09-03T10:00:00Z',
  '2026-09-03T10:00:03Z',
  3,
  3,
  0
);

INSERT INTO operations.source_observations (
  id,
  provider_id,
  sync_run_id,
  observation_type,
  provider_external_id,
  provider_observed_at,
  received_at,
  normalized_at,
  normalization_version,
  mapping_version,
  content_hash
)
VALUES
  ('33000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', 'ODDS', 'opening-home', '2026-09-03T09:00:00Z', '2026-09-03T09:00:01Z', '2026-09-03T09:00:02Z', 'normalization.v1', 'mapping.v1', 'sha256:opening-home'),
  ('33000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', 'ODDS', 'current-home', '2026-09-03T10:00:00Z', '2026-09-03T10:00:01Z', '2026-09-03T10:00:02Z', 'normalization.v1', 'mapping.v1', 'sha256:current-home'),
  ('33000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', 'LINEUP', 'expected-home', '2026-09-03T09:30:00Z', '2026-09-03T09:30:01Z', '2026-09-03T09:30:02Z', 'normalization.v1', 'mapping.v1', 'sha256:expected-home');

INSERT INTO market.market_definitions (
  id,
  sport_id,
  code,
  family_code,
  period_code,
  structure,
  subject_type,
  line_required,
  line_rules,
  settlement_rule_version,
  label_key
)
VALUES
  ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'MATCH_RESULT.FULL_TIME', 'MATCH_RESULT', 'FULL_TIME', 'THREE_WAY', 'EVENT', false, '{"allowed":false}'::jsonb, 'football.match_result.full_time.v1', 'market.match_result.full_time'),
  ('40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'TOTAL.FULL_TIME', 'TOTAL', 'FULL_TIME', 'TWO_WAY', 'EVENT', true, '{"increments":["0.5"]}'::jsonb, 'football.total.full_time.v1', 'market.total.full_time');

INSERT INTO market.outcome_definitions (id, market_definition_id, code, label_key, sort_order)
VALUES
  ('41000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'HOME', 'outcome.home', 1),
  ('41000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000001', 'DRAW', 'outcome.draw', 2),
  ('41000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000001', 'AWAY', 'outcome.away', 3),
  ('41000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000002', 'OVER', 'outcome.over', 1),
  ('41000000-0000-4000-8000-000000000005', '40000000-0000-4000-8000-000000000002', 'UNDER', 'outcome.under', 2);

INSERT INTO market.provider_market_mappings (
  id,
  provider_id,
  provider_market_key,
  provider_outcome_key,
  market_definition_id,
  outcome_definition_id,
  mapping_version,
  effective_from
)
VALUES
  ('42000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'ft_1x2', 'home', '40000000-0000-4000-8000-000000000001', '41000000-0000-4000-8000-000000000001', 'mapping.v1', '2026-01-01T00:00:00Z'),
  ('42000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001', 'ft_1x2', 'draw', '40000000-0000-4000-8000-000000000001', '41000000-0000-4000-8000-000000000002', 'mapping.v1', '2026-01-01T00:00:00Z'),
  ('42000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000001', 'ft_1x2', 'away', '40000000-0000-4000-8000-000000000001', '41000000-0000-4000-8000-000000000003', 'mapping.v1', '2026-01-01T00:00:00Z'),
  ('42000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000001', 'ft_total', 'over', '40000000-0000-4000-8000-000000000002', '41000000-0000-4000-8000-000000000004', 'mapping.v1', '2026-01-01T00:00:00Z'),
  ('42000000-0000-4000-8000-000000000005', '30000000-0000-4000-8000-000000000001', 'ft_total', 'under', '40000000-0000-4000-8000-000000000002', '41000000-0000-4000-8000-000000000005', 'mapping.v1', '2026-01-01T00:00:00Z');

INSERT INTO market.event_markets (
  id,
  event_id,
  market_definition_id,
  line_value,
  canonical_key
)
VALUES
  ('43000000-0000-4000-8000-000000000001', '23000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', NULL, 'FOOTBALL|MATCH_RESULT|FULL_TIME|EVENT|NO_LINE|v1'),
  ('43000000-0000-4000-8000-000000000002', '23000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', '2.5000', 'FOOTBALL|TOTAL|FULL_TIME|EVENT|2.5|v1');

INSERT INTO market.event_market_outcomes (
  id,
  event_market_id,
  outcome_definition_id,
  canonical_key
)
VALUES
  ('44000000-0000-4000-8000-000000000001', '43000000-0000-4000-8000-000000000001', '41000000-0000-4000-8000-000000000001', 'FOOTBALL|MATCH_RESULT|FULL_TIME|EVENT|NO_LINE|HOME|v1'),
  ('44000000-0000-4000-8000-000000000002', '43000000-0000-4000-8000-000000000001', '41000000-0000-4000-8000-000000000002', 'FOOTBALL|MATCH_RESULT|FULL_TIME|EVENT|NO_LINE|DRAW|v1'),
  ('44000000-0000-4000-8000-000000000003', '43000000-0000-4000-8000-000000000001', '41000000-0000-4000-8000-000000000003', 'FOOTBALL|MATCH_RESULT|FULL_TIME|EVENT|NO_LINE|AWAY|v1'),
  ('44000000-0000-4000-8000-000000000004', '43000000-0000-4000-8000-000000000002', '41000000-0000-4000-8000-000000000004', 'FOOTBALL|TOTAL|FULL_TIME|EVENT|2.5|OVER|v1'),
  ('44000000-0000-4000-8000-000000000005', '43000000-0000-4000-8000-000000000002', '41000000-0000-4000-8000-000000000005', 'FOOTBALL|TOTAL|FULL_TIME|EVENT|2.5|UNDER|v1');

INSERT INTO market.bookmakers (id, code, display_name, synthetic, market_classification)
VALUES (
  '45000000-0000-4000-8000-000000000001',
  'SYNTHETIC_BOOK_A',
  'Synthetic Book A',
  true,
  'SYNTHETIC'
);

INSERT INTO market.odds_observations (
  id,
  source_observation_id,
  event_market_outcome_id,
  bookmaker_id,
  decimal_odds,
  provider_observed_at,
  received_at,
  normalized_at,
  status,
  is_synthetic
)
VALUES
  ('46000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000001', '44000000-0000-4000-8000-000000000001', '45000000-0000-4000-8000-000000000001', '2.10000000', '2026-09-03T09:00:00Z', '2026-09-03T09:00:01Z', '2026-09-03T09:00:02Z', 'ACTIVE', true),
  ('46000000-0000-4000-8000-000000000002', '33000000-0000-4000-8000-000000000002', '44000000-0000-4000-8000-000000000001', '45000000-0000-4000-8000-000000000001', '2.00000000', '2026-09-03T10:00:00Z', '2026-09-03T10:00:01Z', '2026-09-03T10:00:02Z', 'ACTIVE', true);

INSERT INTO intelligence.lineup_observations (
  id,
  source_observation_id,
  event_id,
  team_participant_id,
  schema_version,
  status,
  confidence,
  players,
  formation,
  provider_observed_at,
  received_at
)
VALUES (
  '47000000-0000-4000-8000-000000000001',
  '33000000-0000-4000-8000-000000000003',
  '23000000-0000-4000-8000-000000000001',
  '22000000-0000-4000-8000-000000000001',
  'lineup.v1',
  'EXPECTED',
  '0.8000000',
  '[]'::jsonb,
  '4-3-3',
  '2026-09-03T09:30:00Z',
  '2026-09-03T09:30:01Z'
);

INSERT INTO intelligence.data_quality_policy_versions (
  id,
  code,
  version,
  validation_status,
  definition,
  effective_from
)
VALUES (
  '50000000-0000-4000-8000-000000000001',
  'SYNTHETIC_PHASE_1_QUALITY',
  'quality.v1',
  'DEVELOPMENT_HEURISTIC',
  '{"freshnessSeconds":600,"minimumBookmakers":1,"requiresLineup":false}'::jsonb,
  '2026-01-01T00:00:00Z'
);

INSERT INTO intelligence.data_quality_assessments (
  id,
  policy_version_id,
  event_id,
  market_outcome_id,
  as_of,
  grade,
  numeric_score,
  components,
  reason_codes
)
VALUES (
  '51000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001',
  '23000000-0000-4000-8000-000000000001',
  '44000000-0000-4000-8000-000000000001',
  '2026-09-03T10:00:02Z',
  'GOOD',
  '88.5000',
  '{"freshness":"100","coverage":"77"}'::jsonb,
  ARRAY['SYNTHETIC_DATA']::text[]
);

INSERT INTO intelligence.model_definitions (id, code, display_name, description)
VALUES (
  '52000000-0000-4000-8000-000000000001',
  'DETERMINISTIC_PHASE_1',
  'Deterministic Phase 1 Model',
  'Synthetic deterministic development model; not validated for wagering'
);

INSERT INTO intelligence.model_versions (
  id,
  model_definition_id,
  version,
  maturity_status,
  validation_status,
  feature_contract_version
)
VALUES (
  '53000000-0000-4000-8000-000000000001',
  '52000000-0000-4000-8000-000000000001',
  'model.v1',
  'EXPERIMENTAL',
  'UNVALIDATED',
  'features.v1'
);

INSERT INTO intelligence.calibration_versions (
  id,
  model_version_id,
  version,
  method,
  parameters,
  validation_status
)
VALUES (
  '54000000-0000-4000-8000-000000000001',
  '53000000-0000-4000-8000-000000000001',
  'calibration.v1',
  'IDENTITY',
  '{}'::jsonb,
  'UNVALIDATED'
);

INSERT INTO operations.jobs (
  id,
  type,
  contract_version,
  idempotency_key,
  payload,
  status,
  attempt_count,
  max_attempts,
  available_at,
  correlation_id,
  started_at,
  completed_at
)
VALUES (
  '60000000-0000-4000-8000-000000000001',
  'GENERATE_PREDICTION.v1',
  'v1',
  'synthetic-prediction-1',
  '{"eventId":"23000000-0000-4000-8000-000000000001"}'::jsonb,
  'COMPLETED',
  1,
  3,
  '2026-09-03T10:00:02Z',
  '60000000-0000-4000-8000-000000000002',
  '2026-09-03T10:00:02Z',
  '2026-09-03T10:00:03Z'
);

INSERT INTO intelligence.prediction_runs (
  id,
  model_version_id,
  calibration_version_id,
  event_id,
  feature_cutoff,
  status,
  started_at,
  completed_at,
  trigger_job_id
)
VALUES (
  '55000000-0000-4000-8000-000000000001',
  '53000000-0000-4000-8000-000000000001',
  '54000000-0000-4000-8000-000000000001',
  '23000000-0000-4000-8000-000000000001',
  '2026-09-03T10:00:02Z',
  'COMPLETED',
  '2026-09-03T10:00:02Z',
  '2026-09-03T10:00:03Z',
  '60000000-0000-4000-8000-000000000001'
);

INSERT INTO intelligence.predictions (
  id,
  prediction_run_id,
  event_market_outcome_id,
  data_quality_assessment_id,
  market_price_observation_id,
  decision_status,
  model_probability,
  confidence,
  fair_odds,
  market_implied_probability,
  edge,
  expected_value,
  reason_codes,
  structured_reasons
)
VALUES (
  '56000000-0000-4000-8000-000000000001',
  '55000000-0000-4000-8000-000000000001',
  '44000000-0000-4000-8000-000000000001',
  '51000000-0000-4000-8000-000000000001',
  '46000000-0000-4000-8000-000000000002',
  'NO_BET',
  '0.560000000000',
  '0.700000000000',
  '1.78571429',
  '0.500000000000',
  '0.060000000000',
  '0.120000000000',
  ARRAY['DEVELOPMENT_ONLY']::text[],
  '{"summary":"Synthetic deterministic example"}'::jsonb
);

INSERT INTO intelligence.prediction_inputs (
  prediction_id,
  source_observation_id,
  input_role
)
VALUES (
  '56000000-0000-4000-8000-000000000001',
  '33000000-0000-4000-8000-000000000002',
  'CURRENT_PRICE'
);

INSERT INTO intelligence.score_definition_versions (
  id,
  score_type,
  code,
  version,
  validation_status,
  definition,
  effective_from
)
VALUES
  ('57000000-0000-4000-8000-000000000001', 'EDGE', 'PHASE_1_EDGE', 'edge.v1', 'DEVELOPMENT_HEURISTIC', '{"components":["probabilityEdge","expectedValue"]}'::jsonb, '2026-01-01T00:00:00Z'),
  ('57000000-0000-4000-8000-000000000002', 'RADAR', 'PHASE_1_RADAR', 'radar.v1', 'DEVELOPMENT_HEURISTIC', '{"components":["movement","coverage"]}'::jsonb, '2026-01-01T00:00:00Z');

INSERT INTO intelligence.score_results (
  id,
  score_definition_version_id,
  prediction_id,
  event_market_outcome_id,
  data_quality_assessment_id,
  as_of,
  score,
  components,
  weights,
  caps_penalties,
  reason_codes
)
VALUES
  ('58000000-0000-4000-8000-000000000001', '57000000-0000-4000-8000-000000000001', '56000000-0000-4000-8000-000000000001', '44000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001', '2026-09-03T10:00:02Z', '64.2500', '{"edge":"60","expectedValue":"70"}'::jsonb, '{"edge":"0.5","expectedValue":"0.5"}'::jsonb, '{}'::jsonb, ARRAY['DEVELOPMENT_ONLY']::text[]),
  ('58000000-0000-4000-8000-000000000002', '57000000-0000-4000-8000-000000000002', '56000000-0000-4000-8000-000000000001', '44000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001', '2026-09-03T10:00:02Z', '52.0000', '{"movement":"60","coverage":"44"}'::jsonb, '{"movement":"0.5","coverage":"0.5"}'::jsonb, '{}'::jsonb, ARRAY['SYNTHETIC_MOVEMENT']::text[]);

INSERT INTO intelligence.radar_evidence (
  id,
  score_result_id,
  opening_observation_id,
  current_observation_id,
  supporting_observation_ids,
  bookmakers_observed,
  bookmakers_moving,
  movement_window_seconds,
  observable_metrics
)
VALUES (
  '59000000-0000-4000-8000-000000000001',
  '58000000-0000-4000-8000-000000000002',
  '46000000-0000-4000-8000-000000000001',
  '46000000-0000-4000-8000-000000000002',
  ARRAY['46000000-0000-4000-8000-000000000001'::uuid, '46000000-0000-4000-8000-000000000002'::uuid],
  1,
  1,
  3600,
  '{"openingOdds":"2.10000000","currentOdds":"2.00000000"}'::jsonb
);

INSERT INTO audit.admin_audit_events (
  id,
  actor_user_id,
  action,
  resource_type,
  resource_id,
  reason,
  before_state,
  after_state,
  request_id,
  occurred_at
)
VALUES (
  '61000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000003',
  'SYNTHETIC_SEED_CREATED',
  'provider_sync_run',
  '32000000-0000-4000-8000-000000000001',
  'Deterministic Phase 1 test fixture',
  NULL,
  '{"status":"COMPLETED"}'::jsonb,
  '61000000-0000-4000-8000-000000000002',
  '2026-09-03T10:00:04Z'
);
