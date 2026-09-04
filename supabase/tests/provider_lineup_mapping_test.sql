BEGIN;
SELECT plan(7);

SELECT is(public.map_provider_lineup_status('CHANGED'), 'UNAVAILABLE', 'changed provider lineup state maps to the Phase 1 database status');
SELECT is(public.map_provider_lineup_status('MISSING'), 'UNAVAILABLE', 'missing provider lineup state maps to the Phase 1 database status');
SELECT is(public.map_provider_lineup_status('EXPECTED'), 'EXPECTED', 'expected provider lineup state is preserved');
SELECT is(public.map_provider_lineup_status('OFFICIAL'), 'OFFICIAL', 'official provider lineup state is preserved');

SELECT is(count(*)::integer, 1, 'changed lineup keeps mapped status, players, confidence, formation, and lineage')
FROM intelligence.lineup_observations lineup
JOIN operations.source_observations source ON source.id = lineup.source_observation_id
WHERE source.id = '73000000-0000-4000-8000-000000000011'
  AND lineup.status = 'UNAVAILABLE' AND jsonb_array_length(lineup.players) = 2
  AND lineup.confidence = '0.9000000' AND lineup.formation = '4-2-3-1'
  AND lineup.players = '[{"id":"25000000-0000-4000-8000-000000000001","displayName":"Aster Vale (Synthetic)","isSynthetic":true,"syntheticLabel":"Synthetic data"},{"id":"25000000-0000-4000-8000-000000000003","displayName":"Juniper Moss (Synthetic)","isSynthetic":true,"syntheticLabel":"Synthetic data"}]'::jsonb
  AND source.content_hash = 'sha256:8d94a020f516fa75d92e5163670b85930b7ce8675baabc3578fa32c47c684e05';

SELECT is(count(*)::integer, 1, 'missing lineup keeps mapped status, empty players, confidence, and lineage')
FROM intelligence.lineup_observations lineup
JOIN operations.source_observations source ON source.id = lineup.source_observation_id
WHERE source.id = '73000000-0000-4000-8000-000000000002'
  AND lineup.status = 'UNAVAILABLE' AND jsonb_array_length(lineup.players) = 0
  AND lineup.confidence = '0.0000000' AND lineup.formation IS NULL
  AND source.content_hash = 'sha256:893f1c29b5a3cd52ac36ff7730c14ab02be657099ee86e44fceb2206a5217552';

SELECT is(count(*)::integer, 1, 'official lineup keeps players, confidence, formation, and lineage')
FROM intelligence.lineup_observations lineup
JOIN operations.source_observations source ON source.id = lineup.source_observation_id
WHERE source.id = '73000000-0000-4000-8000-000000000012'
  AND lineup.status = 'OFFICIAL' AND jsonb_array_length(lineup.players) = 2
  AND lineup.confidence = '1.0000000' AND lineup.formation = '3-4-2-1'
  AND lineup.players = '[{"id":"25000000-0000-4000-8000-000000000004","displayName":"Rowan Quill (Synthetic)","isSynthetic":true,"syntheticLabel":"Synthetic data"},{"id":"25000000-0000-4000-8000-000000000005","displayName":"Silver Reed (Synthetic)","isSynthetic":true,"syntheticLabel":"Synthetic data"}]'::jsonb
  AND source.content_hash = 'sha256:e686874f9dbc6be96bc268c7f770ccc5df12f43322997abe53f7a2db2fd6acf0';

SELECT * FROM finish();
ROLLBACK;
