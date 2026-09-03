BEGIN;
SELECT plan(10);

INSERT INTO market.outcome_definitions (
  id,
  market_definition_id,
  code,
  label_key,
  sort_order,
  created_at
)
VALUES (
  '70000000-0000-4000-8000-000000000101',
  '40000000-0000-4000-8000-000000000002',
  'HOME',
  'outcome.test.home',
  99,
  '2026-09-03T12:00:00Z'
);

SELECT throws_ok(
  $$UPDATE market.market_definitions SET line_required = true WHERE id = '40000000-0000-4000-8000-000000000001'$$,
  '55000',
  'market.market_definitions semantic identity is immutable',
  'a definition cannot change line requirements underneath event markets'
);

SELECT throws_ok(
  $$UPDATE market.outcome_definitions SET market_definition_id = '70000000-0000-4000-8000-000000000199' WHERE id = '41000000-0000-4000-8000-000000000001'$$,
  '55000',
  'market.outcome_definitions semantic identity is immutable',
  'an outcome cannot move to an invalid definition parent'
);

SELECT throws_ok(
  $$UPDATE market.outcome_definitions SET market_definition_id = '40000000-0000-4000-8000-000000000002' WHERE id = '41000000-0000-4000-8000-000000000001'$$,
  '55000',
  'market.outcome_definitions semantic identity is immutable',
  'an outcome parent change is rejected before it can duplicate an identity'
);

SELECT throws_ok(
  $$UPDATE market.event_markets SET market_definition_id = '40000000-0000-4000-8000-000000000002' WHERE id = '43000000-0000-4000-8000-000000000001'$$,
  '55000',
  'market.event_markets semantic identity is immutable',
  'an event market cannot be reassigned while retaining stale outcomes'
);

SELECT throws_ok(
  $$UPDATE market.event_markets SET line_value = '3.5000' WHERE id = '43000000-0000-4000-8000-000000000002'$$,
  '55000',
  'market.event_markets semantic identity is immutable',
  'an event market line is immutable'
);

SELECT throws_ok(
  $$UPDATE market.event_markets SET canonical_key = 'changed-event-key' WHERE id = '43000000-0000-4000-8000-000000000001'$$,
  '55000',
  'market.event_markets semantic identity is immutable',
  'an event market canonical key is immutable'
);

SELECT throws_ok(
  $$UPDATE market.event_market_outcomes SET event_market_id = '43000000-0000-4000-8000-000000000002' WHERE id = '44000000-0000-4000-8000-000000000001'$$,
  '55000',
  'market.event_market_outcomes semantic identity is immutable',
  'an event outcome cannot be reassigned to a different parent market'
);

SELECT throws_ok(
  $$UPDATE market.event_market_outcomes SET canonical_key = 'changed-outcome-key' WHERE id = '44000000-0000-4000-8000-000000000001'$$,
  '55000',
  'market.event_market_outcomes semantic identity is immutable',
  'an event outcome canonical key is immutable'
);

SELECT lives_ok(
  $$UPDATE market.market_definitions SET label_key = 'market.updated.label' WHERE id = '40000000-0000-4000-8000-000000000001'$$,
  'market definition localization labels remain editable'
);

SELECT lives_ok(
  $$UPDATE market.outcome_definitions SET label_key = 'outcome.updated.label', sort_order = 10 WHERE id = '41000000-0000-4000-8000-000000000001'$$,
  'outcome presentation fields remain editable'
);

SELECT * FROM finish();
ROLLBACK;
