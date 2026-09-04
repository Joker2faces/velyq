BEGIN;
SELECT plan(16);

SELECT throws_ok(
  $$UPDATE operations.source_observations SET content_hash = content_hash WHERE id = '33000000-0000-4000-8000-000000000001'$$,
  '55000',
  'operations.source_observations is append-only',
  'source observations reject UPDATE'
);
SELECT throws_ok(
  $$DELETE FROM operations.source_observations WHERE id = '33000000-0000-4000-8000-000000000001'$$,
  '55000',
  'operations.source_observations is append-only',
  'source observations reject DELETE'
);

SELECT throws_ok(
  $$UPDATE market.odds_observations SET status = status WHERE id = '46000000-0000-4000-8000-000000000001'$$,
  '55000',
  'market.odds_observations is append-only',
  'odds observations reject UPDATE'
);
SELECT throws_ok(
  $$DELETE FROM market.odds_observations WHERE id = '46000000-0000-4000-8000-000000000001'$$,
  '55000',
  'market.odds_observations is append-only',
  'odds observations reject DELETE'
);

SELECT throws_ok(
  $$UPDATE intelligence.data_quality_assessments SET grade = grade WHERE id = '51000000-0000-4000-8000-000000000001'$$,
  '55000',
  'intelligence.data_quality_assessments is append-only',
  'quality assessments reject UPDATE'
);
SELECT throws_ok(
  $$DELETE FROM intelligence.data_quality_assessments WHERE id = '51000000-0000-4000-8000-000000000001'$$,
  '55000',
  'intelligence.data_quality_assessments is append-only',
  'quality assessments reject DELETE'
);

SELECT throws_ok(
  $$UPDATE intelligence.predictions SET decision_status = decision_status WHERE id = '56000000-0000-4000-8000-000000000001'$$,
  '55000',
  'intelligence.predictions is append-only',
  'predictions reject UPDATE'
);
SELECT throws_ok(
  $$DELETE FROM intelligence.predictions WHERE id = '56000000-0000-4000-8000-000000000001'$$,
  '55000',
  'intelligence.predictions is append-only',
  'predictions reject DELETE'
);

SELECT throws_ok(
  $$UPDATE intelligence.prediction_inputs SET input_role = input_role WHERE prediction_id = '56000000-0000-4000-8000-000000000001'$$,
  '55000',
  'intelligence.prediction_inputs is append-only',
  'prediction inputs reject UPDATE'
);
SELECT throws_ok(
  $$DELETE FROM intelligence.prediction_inputs WHERE prediction_id = '56000000-0000-4000-8000-000000000001'$$,
  '55000',
  'intelligence.prediction_inputs is append-only',
  'prediction inputs reject DELETE'
);

SELECT throws_ok(
  $$UPDATE intelligence.score_results SET score = score WHERE id = '58000000-0000-4000-8000-000000000001'$$,
  '55000',
  'intelligence.score_results is append-only',
  'score results reject UPDATE'
);
SELECT throws_ok(
  $$DELETE FROM intelligence.score_results WHERE id = '58000000-0000-4000-8000-000000000001'$$,
  '55000',
  'intelligence.score_results is append-only',
  'score results reject DELETE'
);

SELECT throws_ok(
  $$UPDATE intelligence.radar_evidence SET bookmakers_observed = bookmakers_observed WHERE id = '59000000-0000-4000-8000-000000000001'$$,
  '55000',
  'intelligence.radar_evidence is append-only',
  'radar evidence rejects UPDATE'
);
SELECT throws_ok(
  $$DELETE FROM intelligence.radar_evidence WHERE id = '59000000-0000-4000-8000-000000000001'$$,
  '55000',
  'intelligence.radar_evidence is append-only',
  'radar evidence rejects DELETE'
);

SELECT throws_ok(
  $$UPDATE audit.admin_audit_events SET reason = reason WHERE id = '61000000-0000-4000-8000-000000000001'$$,
  '55000',
  'audit.admin_audit_events is append-only',
  'admin audit events reject UPDATE'
);
SELECT throws_ok(
  $$DELETE FROM audit.admin_audit_events WHERE id = '61000000-0000-4000-8000-000000000001'$$,
  '55000',
  'audit.admin_audit_events is append-only',
  'admin audit events reject DELETE'
);

SELECT * FROM finish();
ROLLBACK;
