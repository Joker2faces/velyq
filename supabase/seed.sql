-- Deterministic local-only identities. These users have no passwords and cannot sign in.
INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-4000-8000-000000000001', 'owner@velyq.local', '{}'::jsonb, '{}'::jsonb, '2026-09-03T08:00:00Z', '2026-09-03T08:00:00Z'),
  ('00000000-0000-4000-8000-000000000002', 'other@velyq.local', '{}'::jsonb, '{}'::jsonb, '2026-09-03T08:00:00Z', '2026-09-03T08:00:00Z'),
  ('00000000-0000-4000-8000-000000000003', 'admin@velyq.local', '{}'::jsonb, '{}'::jsonb, '2026-09-03T08:00:00Z', '2026-09-03T08:00:00Z');

INSERT INTO public.profiles (user_id, display_name, locale, timezone, created_at, updated_at)
VALUES
  ('00000000-0000-4000-8000-000000000001', 'Synthetic Owner', 'en', 'UTC', '2026-09-03T08:00:00Z', '2026-09-03T08:00:00Z'),
  ('00000000-0000-4000-8000-000000000002', 'Synthetic Other User', 'en', 'UTC', '2026-09-03T08:00:00Z', '2026-09-03T08:00:00Z'),
  ('00000000-0000-4000-8000-000000000003', 'Synthetic Administrator', 'en', 'UTC', '2026-09-03T08:00:00Z', '2026-09-03T08:00:00Z');

INSERT INTO private.roles (id, code, description, created_at)
VALUES
  ('10000000-0000-4000-8000-000000000001', 'USER', 'Standard authenticated user', '2026-09-03T08:00:00Z'),
  ('10000000-0000-4000-8000-000000000002', 'ADMIN', 'VELYQ operations administrator', '2026-09-03T08:00:00Z');

INSERT INTO private.permissions (id, code, description, created_at)
VALUES
  ('11000000-0000-4000-8000-000000000000', 'customer.read', 'Read approved customer intelligence', '2026-09-03T08:00:00Z'),
  ('11000000-0000-4000-8000-000000000001', 'admin.access', 'Access the admin application', '2026-09-03T08:00:00Z'),
  ('11000000-0000-4000-8000-000000000002', 'provider_runs.read', 'Read provider run traces', '2026-09-03T08:00:00Z'),
  ('11000000-0000-4000-8000-000000000003', 'predictions.trace', 'Read prediction lineage', '2026-09-03T08:00:00Z'),
  ('11000000-0000-4000-8000-000000000004', 'scores.inspect', 'Inspect score evidence', '2026-09-03T08:00:00Z'),
  ('11000000-0000-4000-8000-000000000005', 'quality.inspect', 'Inspect quality assessments', '2026-09-03T08:00:00Z'),
  ('11000000-0000-4000-8000-000000000006', 'audit.read', 'Read administrator audit events', '2026-09-03T08:00:00Z');

INSERT INTO private.role_permissions (role_id, permission_id, created_at)
SELECT '10000000-0000-4000-8000-000000000002'::uuid, id, '2026-09-03T08:00:00Z'::timestamptz
FROM private.permissions;

INSERT INTO private.role_permissions (role_id, permission_id, created_at)
SELECT '10000000-0000-4000-8000-000000000001'::uuid, id, '2026-09-03T08:00:00Z'::timestamptz
FROM private.permissions
WHERE code = 'customer.read';

INSERT INTO private.user_roles (user_id, role_id, granted_by, granted_at)
VALUES
  ('00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003', '2026-09-03T08:00:00Z'),
  ('00000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003', '2026-09-03T08:00:00Z'),
  ('00000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003', '2026-09-03T08:00:00Z'),
  ('00000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003', '2026-09-03T08:00:00Z');

INSERT INTO catalog.sports (id, code, name_key, created_at)
VALUES ('20000000-0000-4000-8000-000000000001', 'FOOTBALL', 'sport.football', '2026-01-01T00:00:00Z');

INSERT INTO catalog.competitions (id, sport_id, code, name_key, country_code, created_at)
VALUES (
  '21000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'SYNTHETIC_LEAGUE',
  'competition.synthetic_league',
  'ZZ',
  '2026-01-01T00:00:00Z'
);

INSERT INTO catalog.participants (id, sport_id, type, code, display_name, created_at)
VALUES
  ('22000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'TEAM', 'NORTH_CITY', 'North City (Synthetic)', '2026-01-01T00:00:00Z'),
  ('22000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'TEAM', 'SOUTH_UNITED', 'South United (Synthetic)', '2026-01-01T00:00:00Z'),
  ('22000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', 'TEAM', 'EAST_BOROUGH', 'East Borough (Synthetic)', '2026-01-01T00:00:00Z'),
  ('22000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001', 'TEAM', 'WEST_HARBOR', 'West Harbor (Synthetic)', '2026-01-01T00:00:00Z');

INSERT INTO catalog.events (id, sport_id, competition_id, season_label, starts_at, status, synthetic, created_at)
VALUES
  ('23000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', 'Synthetic 2026', '2026-09-03T18:00:00Z', 'SCHEDULED', true, '2026-01-01T00:00:00Z'),
  ('23000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', 'Synthetic 2026', '2026-09-03T20:00:00Z', 'SCHEDULED', true, '2026-01-01T00:00:00Z');

INSERT INTO catalog.event_participants (event_id, participant_id, role, created_at)
VALUES
  ('23000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000001', 'HOME', '2026-01-01T00:00:00Z'),
  ('23000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000002', 'AWAY', '2026-01-01T00:00:00Z'),
  ('23000000-0000-4000-8000-000000000002', '22000000-0000-4000-8000-000000000003', 'HOME', '2026-01-01T00:00:00Z'),
  ('23000000-0000-4000-8000-000000000002', '22000000-0000-4000-8000-000000000004', 'AWAY', '2026-01-01T00:00:00Z');

INSERT INTO operations.providers (id, code, display_name, is_synthetic, created_at)
VALUES (
  '30000000-0000-4000-8000-000000000001',
  'SYNTHETIC_FIXTURES',
  'VELYQ Synthetic Fixtures',
  true,
  '2026-01-01T00:00:00Z'
);

INSERT INTO operations.provider_policy_versions (
  id,
  provider_id,
  version,
  policy,
  effective_from,
  created_at
)
VALUES (
  '31000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'synthetic-fixtures.v1',
  '{"providerCode":"SYNTHETIC_FIXTURES","version":"synthetic-fixtures.v1","providerMode":"SYNTHETIC","effectiveFrom":"2026-01-01T00:00:00Z","effectiveTo":null,"grants":[{"action":"RETAIN_NORMALIZED","environments":["DEVELOPMENT","TEST"],"territories":["ZZ"],"dataCategories":["NORMALIZED_FIXTURE","NORMALIZED_ODDS","NORMALIZED_LINEUP"],"requiredAttribution":true,"retentionDays":3650},{"action":"DISPLAY","environments":["DEVELOPMENT","TEST"],"territories":["ZZ"],"dataCategories":["NORMALIZED_FIXTURE","NORMALIZED_ODDS","NORMALIZED_LINEUP"],"audiences":["CUSTOMER","ADMIN"],"requiredAttribution":true},{"action":"REPLAY","environments":["DEVELOPMENT","TEST"],"territories":["ZZ"],"dataCategories":["REPOSITORY_FIXTURE"],"requiredAttribution":true},{"action":"CACHE","environments":["DEVELOPMENT","TEST"],"territories":["ZZ"],"dataCategories":["REPOSITORY_FIXTURE"],"requiredAttribution":true,"retentionDays":3650},{"action":"BACKTEST","environments":["DEVELOPMENT","TEST"],"territories":["ZZ"],"dataCategories":["NORMALIZED_ODDS"],"requiredAttribution":true}]}'::jsonb,
  '2026-01-01T00:00:00Z',
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
  normalized_output_hash,
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
VALUES
  ('32000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'SYNTHETIC_REPLAY', 'COMPLETED', 'sequence-01-opening', 'packages/providers/src/mock/fixtures/v1/sequence-01-opening.json', 'sha256:fc9835303008b24c3c1735ac931a82c04ea69f7e751e5600927916d2d5a11c2e', 'sha256:147a2d4f1bd19000a53466b0068d311a47ca52eac6e7efce5a5059e325d934c0', 'provider-sequence.v1', 'normalization.v1', 'mapping.v1', '31000000-0000-4000-8000-000000000001', '2026-09-03T09:00:01Z', '2026-09-03T09:00:02Z', 9, 9, 0),
  ('32000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001', 'SYNTHETIC_REPLAY', 'COMPLETED', 'sequence-02-movement', 'packages/providers/src/mock/fixtures/v1/sequence-02-movement.json', 'sha256:150cfd25a412920149808f1c919773ea606f05c9c17193bce96d9ca22cf5ac2e', 'sha256:205cca43bc319399b7d157eeb23c0a2fe6cd5f8c3b4547b520086dc668abfd22', 'provider-sequence.v1', 'normalization.v1', 'mapping.v1', '31000000-0000-4000-8000-000000000001', '2026-09-03T10:00:01Z', '2026-09-03T10:00:02Z', 2, 2, 0),
  ('32000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000001', 'SYNTHETIC_REPLAY', 'COMPLETED', 'sequence-03-lineup-change', 'packages/providers/src/mock/fixtures/v1/sequence-03-lineup-change.json', 'sha256:d780bb0b2a2ee36155753db851ea64e9b126a5ac11f2237f8fa947d2dec693ab', 'sha256:7962c7d00c06b111f95aa213b1fe49b7fb8cd80e1b11eeb9753c82517eba7a2a', 'provider-sequence.v1', 'normalization.v1', 'mapping.v1', '31000000-0000-4000-8000-000000000001', '2026-09-03T10:00:01Z', '2026-09-03T10:00:02Z', 2, 2, 0),
  ('32000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000001', 'SYNTHETIC_REPLAY', 'COMPLETED', 'sequence-04-repriced', 'packages/providers/src/mock/fixtures/v1/sequence-04-repriced.json', 'sha256:4efcf52964764f53695fc6ecb447bc2197f906e4d6e32ed1532fda7b9d420912', 'sha256:80b59bcdd8c4de58344259c25cb88827fbb492dc2cbb4927e5e1d8186fa5fc87', 'provider-sequence.v1', 'normalization.v1', 'mapping.v1', '31000000-0000-4000-8000-000000000001', '2026-09-03T10:30:01Z', '2026-09-03T10:30:02Z', 2, 1, 1);

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
  ('72000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', 'ODDS', 'opening-north-home-a', '2026-09-03T09:00:00Z', '2026-09-03T09:00:01Z', '2026-09-03T09:00:02Z', 'normalization.v1', 'mapping.v1', 'sha256:d03718f58c0f020ad4e4692f3b9675b23176e53149ec9350e7e74e8efc2ecfc7'),
  ('72000000-0000-4000-8000-000000000011', '30000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000002', 'ODDS', 'current-north-home-a', '2026-09-03T10:00:00Z', '2026-09-03T10:00:01Z', '2026-09-03T10:00:02Z', 'normalization.v1', 'mapping.v1', 'sha256:45cd99e55bf84c192a11b289e64947f40c159a5baacff5e8c6f8026aa296bc29'),
  ('73000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', 'LINEUP', 'expected-north', '2026-09-03T09:00:00Z', '2026-09-03T09:00:01Z', '2026-09-03T09:00:02Z', 'normalization.v1', 'mapping.v1', 'sha256:ac90be2cb4e4039a510c0a13d008f8f741f089a42d8adad576f4c79fa152aabd'),
  ('71000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', 'FIXTURE', 'fictional-event-north-south', '2026-09-03T08:59:00Z', '2026-09-03T09:00:01Z', '2026-09-03T09:00:02Z', 'normalization.v1', 'mapping.v1', 'sha256:140b880d060f015c0ab3a181c14dc6639d87899dd80849f31189f069cef0d001'),
  ('71000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', 'FIXTURE', 'fictional-event-east-west', '2026-09-03T08:59:10Z', '2026-09-03T09:00:01Z', '2026-09-03T09:00:02Z', 'normalization.v1', 'mapping.v1', 'sha256:a15c29631b1f6509281e0483081c70f2375d298114d6cf69915e5d96e456a10e'),
  ('72000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', 'ODDS', 'opening-north-draw-a', '2026-09-03T09:00:00Z', '2026-09-03T09:00:01Z', '2026-09-03T09:00:02Z', 'normalization.v1', 'mapping.v1', 'sha256:d7809d9494d51a56dc1915f97c8d04832f61f39413a845f1910f4904010a704a'),
  ('72000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', 'ODDS', 'opening-north-away-b', '2026-09-03T09:00:00Z', '2026-09-03T09:00:01Z', '2026-09-03T09:00:02Z', 'normalization.v1', 'mapping.v1', 'sha256:d045d539b103cff5ddde231198f87a155306d1c8eeeafe373dc68a574e809756'),
  ('72000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', 'ODDS', 'opening-north-over-a', '2026-09-03T09:00:00Z', '2026-09-03T09:00:01Z', '2026-09-03T09:00:02Z', 'normalization.v1', 'mapping.v1', 'sha256:fbcd6c0d392a08a5255043056ca176ff7ad84808481753b0db80552d121311e8'),
  ('72000000-0000-4000-8000-000000000005', '30000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', 'ODDS', 'opening-north-under-b', '2026-09-03T09:00:00Z', '2026-09-03T09:00:01Z', '2026-09-03T09:00:02Z', 'normalization.v1', 'mapping.v1', 'sha256:0e41be6d97450e9053d68c4429b7494f1ab1776a2045f3d25d9429a12a8d38f2'),
  ('73000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', 'LINEUP', 'missing-east', '2026-09-03T09:00:00Z', '2026-09-03T09:00:01Z', '2026-09-03T09:00:02Z', 'normalization.v1', 'mapping.v1', 'sha256:893f1c29b5a3cd52ac36ff7730c14ab02be657099ee86e44fceb2206a5217552'),
  ('72000000-0000-4000-8000-000000000012', '30000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000002', 'ODDS', 'stale-east-home-b', '2026-09-03T08:00:00Z', '2026-09-03T10:00:01Z', '2026-09-03T10:00:02Z', 'normalization.v1', 'mapping.v1', 'sha256:67cdab90b2b078ec39ab4bd578ddb1e006b2547650aced82c6c36c3af70e2bff'),
  ('73000000-0000-4000-8000-000000000011', '30000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000003', 'LINEUP', 'changed-north', '2026-09-03T10:00:00Z', '2026-09-03T10:00:01Z', '2026-09-03T10:00:02Z', 'normalization.v1', 'mapping.v1', 'sha256:8d94a020f516fa75d92e5163670b85930b7ce8675baabc3578fa32c47c684e05'),
  ('73000000-0000-4000-8000-000000000012', '30000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000003', 'LINEUP', 'official-south', '2026-09-03T10:00:00Z', '2026-09-03T10:00:01Z', '2026-09-03T10:00:02Z', 'normalization.v1', 'mapping.v1', 'sha256:e686874f9dbc6be96bc268c7f770ccc5df12f43322997abe53f7a2db2fd6acf0'),
  ('72000000-0000-4000-8000-000000000021', '30000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000004', 'ODDS', 'repriced-north-home-a', '2026-09-03T10:30:00Z', '2026-09-03T10:30:01Z', '2026-09-03T10:30:02Z', 'normalization.v1', 'mapping.v1', 'sha256:476ce47adfd4b3a312962caa100dd222174f57e4d1533e72a8f6588c8d2a91cd'),
  ('72000000-0000-4000-8000-000000000022', '30000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000004', 'ODDS', 'unknown-fictional-market', '2026-09-03T10:30:00Z', '2026-09-03T10:30:01Z', '2026-09-03T10:30:02Z', 'normalization.v1', 'mapping.v1', 'sha256:f3b5f4346d206618fd4f6da1b9699a66d2cb2245e72435c6d38fb2116edd4121');

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
  label_key,
  created_at
)
VALUES
  ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'FOOTBALL_FULL_TIME_1X2', 'MATCH_RESULT', 'FULL_TIME', 'THREE_WAY', 'EVENT', false, '{"allowed":false}'::jsonb, 'FOOTBALL_1X2_FULL_TIME_V1', 'market.match_result.full_time', '2026-01-01T00:00:00Z'),
  ('40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'FOOTBALL_FULL_TIME_TOTAL', 'TOTAL', 'FULL_TIME', 'TWO_WAY', 'EVENT', true, '{"increments":["0.5"]}'::jsonb, 'FOOTBALL_TOTAL_2_5_FULL_TIME_V1', 'market.total.full_time', '2026-01-01T00:00:00Z');

INSERT INTO market.outcome_definitions (id, market_definition_id, code, label_key, sort_order, created_at)
VALUES
  ('41000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'HOME', 'outcome.home', 1, '2026-01-01T00:00:00Z'),
  ('41000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000001', 'DRAW', 'outcome.draw', 2, '2026-01-01T00:00:00Z'),
  ('41000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000001', 'AWAY', 'outcome.away', 3, '2026-01-01T00:00:00Z'),
  ('41000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000002', 'OVER', 'outcome.over', 1, '2026-01-01T00:00:00Z'),
  ('41000000-0000-4000-8000-000000000005', '40000000-0000-4000-8000-000000000002', 'UNDER', 'outcome.under', 2, '2026-01-01T00:00:00Z');

INSERT INTO market.provider_market_mappings (
  id,
  provider_id,
  provider_market_key,
  provider_outcome_key,
  market_definition_id,
  outcome_definition_id,
  mapping_version,
  effective_from,
  created_at
)
VALUES
  ('42000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'ft_1x2', 'home', '40000000-0000-4000-8000-000000000001', '41000000-0000-4000-8000-000000000001', 'mapping.v1', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('42000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001', 'ft_1x2', 'draw', '40000000-0000-4000-8000-000000000001', '41000000-0000-4000-8000-000000000002', 'mapping.v1', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('42000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000001', 'ft_1x2', 'away', '40000000-0000-4000-8000-000000000001', '41000000-0000-4000-8000-000000000003', 'mapping.v1', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('42000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000001', 'ft_total', 'over', '40000000-0000-4000-8000-000000000002', '41000000-0000-4000-8000-000000000004', 'mapping.v1', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('42000000-0000-4000-8000-000000000005', '30000000-0000-4000-8000-000000000001', 'ft_total', 'under', '40000000-0000-4000-8000-000000000002', '41000000-0000-4000-8000-000000000005', 'mapping.v1', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');

INSERT INTO market.event_markets (
  id,
  event_id,
  market_definition_id,
  line_value,
  canonical_key,
  created_at
)
VALUES
  ('43000000-0000-4000-8000-000000000001', '23000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', NULL, 'market-key-v1|event=23000000-0000-4000-8000-000000000001|sport=FOOTBALL|family=MATCH_RESULT|period=FULL_TIME|structure=THREE_WAY|subject=EVENT:NONE|subject-id=-|line=-|rule=FOOTBALL_1X2_FULL_TIME_V1', '2026-09-03T09:00:02Z'),
  ('43000000-0000-4000-8000-000000000002', '23000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', '2.5000', 'market-key-v1|event=23000000-0000-4000-8000-000000000001|sport=FOOTBALL|family=TOTAL|period=FULL_TIME|structure=TWO_WAY|subject=EVENT:NONE|subject-id=-|line=2.5|rule=FOOTBALL_TOTAL_2_5_FULL_TIME_V1', '2026-09-03T09:00:02Z');

INSERT INTO market.event_market_outcomes (
  id,
  event_market_id,
  market_definition_id,
  outcome_definition_id,
  canonical_key,
  created_at
)
VALUES
  ('44000000-0000-4000-8000-000000000001', '43000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '41000000-0000-4000-8000-000000000001', 'market-key-v1|event=23000000-0000-4000-8000-000000000001|sport=FOOTBALL|family=MATCH_RESULT|period=FULL_TIME|structure=THREE_WAY|subject=EVENT:NONE|subject-id=-|line=-|outcome=HOME|rule=FOOTBALL_1X2_FULL_TIME_V1', '2026-09-03T09:00:02Z'),
  ('44000000-0000-4000-8000-000000000002', '43000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '41000000-0000-4000-8000-000000000002', 'market-key-v1|event=23000000-0000-4000-8000-000000000001|sport=FOOTBALL|family=MATCH_RESULT|period=FULL_TIME|structure=THREE_WAY|subject=EVENT:NONE|subject-id=-|line=-|outcome=DRAW|rule=FOOTBALL_1X2_FULL_TIME_V1', '2026-09-03T09:00:02Z'),
  ('44000000-0000-4000-8000-000000000003', '43000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '41000000-0000-4000-8000-000000000003', 'market-key-v1|event=23000000-0000-4000-8000-000000000001|sport=FOOTBALL|family=MATCH_RESULT|period=FULL_TIME|structure=THREE_WAY|subject=EVENT:NONE|subject-id=-|line=-|outcome=AWAY|rule=FOOTBALL_1X2_FULL_TIME_V1', '2026-09-03T09:00:02Z'),
  ('44000000-0000-4000-8000-000000000004', '43000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002', '41000000-0000-4000-8000-000000000004', 'market-key-v1|event=23000000-0000-4000-8000-000000000001|sport=FOOTBALL|family=TOTAL|period=FULL_TIME|structure=TWO_WAY|subject=EVENT:NONE|subject-id=-|line=2.5|outcome=OVER|rule=FOOTBALL_TOTAL_2_5_FULL_TIME_V1', '2026-09-03T09:00:02Z'),
  ('44000000-0000-4000-8000-000000000005', '43000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002', '41000000-0000-4000-8000-000000000005', 'market-key-v1|event=23000000-0000-4000-8000-000000000001|sport=FOOTBALL|family=TOTAL|period=FULL_TIME|structure=TWO_WAY|subject=EVENT:NONE|subject-id=-|line=2.5|outcome=UNDER|rule=FOOTBALL_TOTAL_2_5_FULL_TIME_V1', '2026-09-03T09:00:02Z');

INSERT INTO market.event_markets (id, event_id, market_definition_id, line_value, canonical_key, created_at)
VALUES ('43000000-0000-4000-8000-000000000003', '23000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000001', NULL, 'market-key-v1|event=23000000-0000-4000-8000-000000000002|sport=FOOTBALL|family=MATCH_RESULT|period=FULL_TIME|structure=THREE_WAY|subject=EVENT:NONE|subject-id=-|line=-|rule=FOOTBALL_1X2_FULL_TIME_V1', '2026-09-03T09:00:02Z');

INSERT INTO market.event_market_outcomes (id, event_market_id, market_definition_id, outcome_definition_id, canonical_key, created_at)
VALUES
  ('44000000-0000-4000-8000-000000000006', '43000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000001', '41000000-0000-4000-8000-000000000001', 'market-key-v1|event=23000000-0000-4000-8000-000000000002|sport=FOOTBALL|family=MATCH_RESULT|period=FULL_TIME|structure=THREE_WAY|subject=EVENT:NONE|subject-id=-|line=-|outcome=HOME|rule=FOOTBALL_1X2_FULL_TIME_V1', '2026-09-03T09:00:02Z');

INSERT INTO market.bookmakers (id, code, display_name, synthetic, market_classification, created_at)
VALUES
  ('45000000-0000-4000-8000-000000000001', 'SYNTHETIC_BOOK_A', 'Synthetic Book A', true, 'SYNTHETIC', '2026-01-01T00:00:00Z'),
  ('45000000-0000-4000-8000-000000000002', 'SYNTHETIC_BOOK_B', 'Synthetic Book B', true, 'SYNTHETIC', '2026-01-01T00:00:00Z');

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
  is_synthetic,
  created_at
)
VALUES
  ('46000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001', '44000000-0000-4000-8000-000000000001', '45000000-0000-4000-8000-000000000001', '2.10000000', '2026-09-03T09:00:00Z', '2026-09-03T09:00:01Z', '2026-09-03T09:00:02Z', 'ACTIVE', true, '2026-09-03T09:00:02Z'),
  ('46000000-0000-4000-8000-000000000002', '72000000-0000-4000-8000-000000000011', '44000000-0000-4000-8000-000000000001', '45000000-0000-4000-8000-000000000001', '1.85000000', '2026-09-03T10:00:00Z', '2026-09-03T10:00:01Z', '2026-09-03T10:00:02Z', 'ACTIVE', true, '2026-09-03T10:00:02Z'),
  ('46000000-0000-4000-8000-000000000003', '72000000-0000-4000-8000-000000000002', '44000000-0000-4000-8000-000000000002', '45000000-0000-4000-8000-000000000001', '3.40000000', '2026-09-03T09:00:00Z', '2026-09-03T09:00:01Z', '2026-09-03T09:00:02Z', 'ACTIVE', true, '2026-09-03T09:00:02Z'),
  ('46000000-0000-4000-8000-000000000004', '72000000-0000-4000-8000-000000000003', '44000000-0000-4000-8000-000000000003', '45000000-0000-4000-8000-000000000002', '3.80000000', '2026-09-03T09:00:00Z', '2026-09-03T09:00:01Z', '2026-09-03T09:00:02Z', 'ACTIVE', true, '2026-09-03T09:00:02Z'),
  ('46000000-0000-4000-8000-000000000005', '72000000-0000-4000-8000-000000000004', '44000000-0000-4000-8000-000000000004', '45000000-0000-4000-8000-000000000001', '1.95000000', '2026-09-03T09:00:00Z', '2026-09-03T09:00:01Z', '2026-09-03T09:00:02Z', 'ACTIVE', true, '2026-09-03T09:00:02Z'),
  ('46000000-0000-4000-8000-000000000006', '72000000-0000-4000-8000-000000000005', '44000000-0000-4000-8000-000000000005', '45000000-0000-4000-8000-000000000002', '1.90000000', '2026-09-03T09:00:00Z', '2026-09-03T09:00:01Z', '2026-09-03T09:00:02Z', 'ACTIVE', true, '2026-09-03T09:00:02Z'),
  ('46000000-0000-4000-8000-000000000007', '72000000-0000-4000-8000-000000000012', '44000000-0000-4000-8000-000000000006', '45000000-0000-4000-8000-000000000002', '2.25000000', '2026-09-03T08:00:00Z', '2026-09-03T10:00:01Z', '2026-09-03T10:00:02Z', 'ACTIVE', true, '2026-09-03T10:00:02Z'),
  ('46000000-0000-4000-8000-000000000008', '72000000-0000-4000-8000-000000000021', '44000000-0000-4000-8000-000000000001', '45000000-0000-4000-8000-000000000001', '1.62000000', '2026-09-03T10:30:00Z', '2026-09-03T10:30:01Z', '2026-09-03T10:30:02Z', 'ACTIVE', true, '2026-09-03T10:30:02Z');

-- Phase 1 stores provider CHANGED/MISSING lineup states as the schema's
-- UNAVAILABLE status; the original semantic states remain in the governed
-- provider sequence scenarios and source-observation lineage above.
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
  '73000000-0000-4000-8000-000000000001',
  '23000000-0000-4000-8000-000000000001',
  '22000000-0000-4000-8000-000000000001',
  'lineup.v1',
  'EXPECTED',
  '0.8000000',
  '[{"id":"25000000-0000-4000-8000-000000000001","displayName":"Aster Vale (Synthetic)","isSynthetic":true,"syntheticLabel":"Synthetic data"},{"id":"25000000-0000-4000-8000-000000000002","displayName":"Cedar Pike (Synthetic)","isSynthetic":true,"syntheticLabel":"Synthetic data"}]'::jsonb,
  '4-3-3',
  '2026-09-03T09:00:00Z',
  '2026-09-03T09:00:01Z'
), (
  '47000000-0000-4000-8000-000000000002',
  '73000000-0000-4000-8000-000000000011',
  '23000000-0000-4000-8000-000000000001',
  '22000000-0000-4000-8000-000000000001',
  'lineup.v1',
  public.map_provider_lineup_status('CHANGED'),
  '0.9000000',
  '[{"id":"25000000-0000-4000-8000-000000000001","displayName":"Aster Vale (Synthetic)","isSynthetic":true,"syntheticLabel":"Synthetic data"},{"id":"25000000-0000-4000-8000-000000000003","displayName":"Juniper Moss (Synthetic)","isSynthetic":true,"syntheticLabel":"Synthetic data"}]'::jsonb,
  '4-2-3-1',
  '2026-09-03T10:00:00Z',
  '2026-09-03T10:00:01Z'
), (
  '47000000-0000-4000-8000-000000000003',
  '73000000-0000-4000-8000-000000000012',
  '23000000-0000-4000-8000-000000000001',
  '22000000-0000-4000-8000-000000000002',
  'lineup.v1',
  'OFFICIAL',
  '1.0000000',
  '[{"id":"25000000-0000-4000-8000-000000000004","displayName":"Rowan Quill (Synthetic)","isSynthetic":true,"syntheticLabel":"Synthetic data"},{"id":"25000000-0000-4000-8000-000000000005","displayName":"Silver Reed (Synthetic)","isSynthetic":true,"syntheticLabel":"Synthetic data"}]'::jsonb,
  '3-4-2-1',
  '2026-09-03T10:00:00Z',
  '2026-09-03T10:00:01Z'
), (
  '47000000-0000-4000-8000-000000000004',
  '73000000-0000-4000-8000-000000000002',
  '23000000-0000-4000-8000-000000000002',
  '22000000-0000-4000-8000-000000000003',
  'lineup.v1',
  public.map_provider_lineup_status('MISSING'),
  '0.0000000',
  '[]'::jsonb,
  NULL,
  '2026-09-03T09:00:00Z',
  '2026-09-03T09:00:01Z'
);

INSERT INTO intelligence.data_quality_policy_versions (
  id,
  code,
  version,
  validation_status,
  definition,
  effective_from,
  created_at
)
VALUES (
  '50000000-0000-4000-8000-000000000001',
  'SYNTHETIC_PHASE_1_QUALITY',
  'quality.v1',
  'DEVELOPMENT_HEURISTIC',
  '{"freshnessSeconds":600,"minimumBookmakers":1,"requiresLineup":false}'::jsonb,
  '2026-01-01T00:00:00Z',
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
  reason_codes,
  created_at
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
  ARRAY['SYNTHETIC_DATA']::text[],
  '2026-09-03T10:00:02Z'
);

INSERT INTO intelligence.model_definitions (id, code, display_name, description, created_at)
VALUES (
  '52000000-0000-4000-8000-000000000001',
  'DETERMINISTIC_PHASE_1',
  'Deterministic Phase 1 Model',
  'Synthetic deterministic development model; not validated for wagering',
  '2026-01-01T00:00:00Z'
);

INSERT INTO intelligence.model_versions (
  id,
  model_definition_id,
  version,
  maturity_status,
  validation_status,
  feature_contract_version,
  created_at
)
VALUES (
  '53000000-0000-4000-8000-000000000001',
  '52000000-0000-4000-8000-000000000001',
  'model.v1',
  'EXPERIMENTAL',
  'UNVALIDATED',
  'features.v1',
  '2026-01-01T00:00:00Z'
);

INSERT INTO intelligence.calibration_versions (
  id,
  model_version_id,
  version,
  method,
  parameters,
  validation_status,
  created_at
)
VALUES (
  '54000000-0000-4000-8000-000000000001',
  '53000000-0000-4000-8000-000000000001',
  'calibration.v1',
  'IDENTITY',
  '{}'::jsonb,
  'UNVALIDATED',
  '2026-01-01T00:00:00Z'
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
  causation_id,
  created_at,
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
  '60000000-0000-4000-8000-000000000003',
  '2026-09-03T10:00:02Z',
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
  structured_reasons,
  created_at
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
  '{"summary":"Synthetic deterministic example"}'::jsonb,
  '2026-09-03T10:00:03Z'
);

INSERT INTO intelligence.prediction_inputs (
  prediction_id,
  source_observation_id,
  input_role,
  created_at
)
VALUES (
  '56000000-0000-4000-8000-000000000001',
  '72000000-0000-4000-8000-000000000011',
  'CURRENT_PRICE',
  '2026-09-03T10:00:03Z'
);

INSERT INTO intelligence.score_definition_versions (
  id,
  score_type,
  code,
  version,
  validation_status,
  definition,
  effective_from,
  created_at
)
VALUES
  ('57000000-0000-4000-8000-000000000001', 'EDGE', 'PHASE_1_EDGE', 'edge.v1', 'DEVELOPMENT_HEURISTIC', '{"components":["probabilityEdge","expectedValue","quality"],"weights":{"probabilityEdge":"1","expectedValue":"1","quality":"1"},"capsPenalties":{}}'::jsonb, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('57000000-0000-4000-8000-000000000002', 'RADAR', 'PHASE_1_RADAR', 'radar.v1', 'DEVELOPMENT_HEURISTIC', '{"components":["movement","coverage"],"weights":{"movement":"1","coverage":"1"},"capsPenalties":{}}'::jsonb, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');

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
  reason_codes,
  created_at
)
VALUES
  ('58000000-0000-4000-8000-000000000001', '57000000-0000-4000-8000-000000000001', '56000000-0000-4000-8000-000000000001', '44000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001', '2026-09-03T10:00:02Z', '64.2500', '{"edge":"60","expectedValue":"70"}'::jsonb, '{"edge":"0.5","expectedValue":"0.5"}'::jsonb, '{}'::jsonb, ARRAY['DEVELOPMENT_ONLY']::text[], '2026-09-03T10:00:03Z'),
  ('58000000-0000-4000-8000-000000000002', '57000000-0000-4000-8000-000000000002', '56000000-0000-4000-8000-000000000001', '44000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001', '2026-09-03T10:00:02Z', '52.0000', '{"movement":"60","coverage":"44"}'::jsonb, '{"movement":"0.5","coverage":"0.5"}'::jsonb, '{}'::jsonb, ARRAY['SYNTHETIC_MOVEMENT']::text[], '2026-09-03T10:00:03Z');

INSERT INTO intelligence.radar_evidence (
  id,
  score_result_id,
  opening_observation_id,
  current_observation_id,
  supporting_observation_ids,
  bookmakers_observed,
  bookmakers_moving,
  movement_window_seconds,
  observable_metrics,
  created_at
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
  '{"openingOdds":"2.10000000","currentOdds":"1.85000000"}'::jsonb,
  '2026-09-03T10:00:03Z'
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
