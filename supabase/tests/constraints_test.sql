BEGIN;
SELECT plan(9);

SELECT throws_ok(
  $$
    INSERT INTO market.event_markets (
      id, event_id, market_definition_id, line_value, canonical_key
    ) VALUES (
      '70000000-0000-4000-8000-000000000001',
      '23000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000002',
      'NaN'::numeric,
      'invalid-nan-line'
    )
  $$,
  '23514',
  NULL,
  'event market lines reject numeric NaN'
);

SELECT throws_ok(
  $$
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
    ) VALUES (
      '70000000-0000-4000-8000-000000000002',
      '33000000-0000-4000-8000-000000000001',
      '44000000-0000-4000-8000-000000000002',
      '45000000-0000-4000-8000-000000000001',
      'NaN'::numeric,
      '2026-09-03T09:00:00Z',
      '2026-09-03T09:00:01Z',
      '2026-09-03T09:00:02Z',
      'ACTIVE',
      true
    )
  $$,
  '23514',
  NULL,
  'odds reject numeric NaN even though PostgreSQL orders it above finite values'
);

SELECT throws_ok(
  $$
    INSERT INTO intelligence.lineup_observations (
      id,
      source_observation_id,
      event_id,
      team_participant_id,
      schema_version,
      status,
      players,
      provider_observed_at,
      received_at
    ) VALUES (
      '70000000-0000-4000-8000-000000000003',
      '33000000-0000-4000-8000-000000000003',
      '23000000-0000-4000-8000-000000000001',
      '22000000-0000-4000-8000-000000000002',
      'lineup.v1',
      'EXPECTED',
      '{"player":"not-an-array"}'::jsonb,
      '2026-09-03T09:30:00Z',
      '2026-09-03T09:30:01Z'
    )
  $$,
  '23514',
  NULL,
  'lineup_observations_players_array_check rejects provider-shaped objects'
);

SELECT throws_ok(
  $$
    INSERT INTO intelligence.predictions (
      id,
      prediction_run_id,
      event_market_outcome_id,
      data_quality_assessment_id,
      decision_status,
      model_probability,
      reason_codes,
      structured_reasons
    ) VALUES (
      '70000000-0000-4000-8000-000000000004',
      '55000000-0000-4000-8000-000000000001',
      '44000000-0000-4000-8000-000000000002',
      '51000000-0000-4000-8000-000000000001',
      'INSUFFICIENT_DATA',
      'NaN'::numeric,
      ARRAY['INVALID_PROBABILITY']::text[],
      '{}'::jsonb
    )
  $$,
  '23514',
  NULL,
  'prediction probabilities reject numeric NaN'
);

SELECT throws_ok(
  $$
    INSERT INTO intelligence.score_results (
      id,
      score_definition_version_id,
      event_market_outcome_id,
      data_quality_assessment_id,
      as_of,
      score,
      components,
      weights,
      caps_penalties,
      reason_codes
    ) VALUES (
      '70000000-0000-4000-8000-000000000005',
      '57000000-0000-4000-8000-000000000001',
      '44000000-0000-4000-8000-000000000002',
      '51000000-0000-4000-8000-000000000001',
      '2026-09-03T10:00:02Z',
      'NaN'::numeric,
      '{}'::jsonb,
      '{}'::jsonb,
      '{}'::jsonb,
      ARRAY['INVALID_SCORE']::text[]
    )
  $$,
  '23514',
  NULL,
  'score results reject numeric NaN'
);

SELECT throws_ok(
  $$
    INSERT INTO market.event_market_outcomes (
      id, event_market_id, outcome_definition_id, canonical_key
    ) VALUES (
      '70000000-0000-4000-8000-000000000006',
      '43000000-0000-4000-8000-000000000001',
      '41000000-0000-4000-8000-000000000004',
      'invalid-cross-market-outcome'
    )
  $$,
  '23514',
  'event market outcome must use an outcome from its market definition',
  'event market outcome identity cannot cross market definitions'
);

SELECT lives_ok(
  $$
    INSERT INTO market.event_markets (
      id, event_id, market_definition_id, line_value, canonical_key
    ) VALUES (
      '70000000-0000-4000-8000-000000000007',
      '23000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000002',
      '3.5000',
      'valid-finite-line'
    )
  $$,
  'finite canonical decimals remain valid'
);

SELECT throws_ok(
  $$
    INSERT INTO market.event_markets (
      id, event_id, market_definition_id, line_value, canonical_key
    ) VALUES (
      '70000000-0000-4000-8000-000000000008',
      '23000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      '1.0000',
      'invalid-unexpected-line'
    )
  $$,
  '23514',
  'event market line presence must match its market definition',
  'markets without a line reject unexpected line values'
);

SELECT throws_ok(
  $$
    INSERT INTO market.event_markets (
      id, event_id, market_definition_id, line_value, canonical_key
    ) VALUES (
      '70000000-0000-4000-8000-000000000009',
      '23000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000002',
      NULL,
      'invalid-missing-line'
    )
  $$,
  '23514',
  'event market line presence must match its market definition',
  'line-based markets reject missing line values'
);

SELECT * FROM finish();
ROLLBACK;
