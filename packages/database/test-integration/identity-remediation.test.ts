import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPrivilegedDatabaseClient } from "../src/client.js";
import {
  diagnoseIdentityAnomalies,
  remediateIdentityAnomalies,
} from "../src/maintenance/identity-remediation.js";

const DATABASE_URL =
  process.env["DATABASE_URL"] ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const client = createPrivilegedDatabaseClient({
  connectionString: DATABASE_URL,
});

const REPAIRABLE_EVENT = "91000000-0000-4000-8000-000000000001";
const UNRESOLVED_EVENT = "91000000-0000-4000-8000-000000000002";
const INVALID_IDENTITY = "91000000-0000-4000-8000-000000000003";
let baseline: Awaited<ReturnType<typeof diagnoseIdentityAnomalies>>;

describe("identity anomaly remediation against a real database", () => {
  beforeAll(async () => {
    baseline = await diagnoseIdentityAnomalies(client.pool);
    await client.pool.query(`
      ALTER TABLE catalog.events DISABLE TRIGGER events_provenance_required;
      ALTER TABLE catalog.competition_identities
        DROP CONSTRAINT competition_identities_confirmed_requires_catalog;

      INSERT INTO operations.providers (id, code, display_name, is_synthetic)
      VALUES ('91000000-0000-4000-8000-000000000010', 'REMEDIATION_TEST_PROVIDER', 'Remediation test', false)
      ON CONFLICT (code) DO NOTHING;

      INSERT INTO operations.provider_policy_versions
        (id, provider_id, version, policy, effective_from)
      VALUES (
        '91000000-0000-4000-8000-000000000011',
        (SELECT id FROM operations.providers WHERE code = 'REMEDIATION_TEST_PROVIDER'),
        'remediation-test-v1', '{}', '2026-01-01T00:00:00Z'
      ) ON CONFLICT DO NOTHING;

      INSERT INTO operations.provider_sync_runs
        (id, provider_id, capability, status, provider_schema_version,
         normalization_version, mapping_version, policy_version_id)
      VALUES (
        '91000000-0000-4000-8000-000000000012',
        (SELECT id FROM operations.providers WHERE code = 'REMEDIATION_TEST_PROVIDER'),
        'ODDS', 'COMPLETED', 'test', 'test', 'test',
        '91000000-0000-4000-8000-000000000011'
      ) ON CONFLICT DO NOTHING;

      INSERT INTO catalog.competition_identities
        (id, provider_id, provider_competition_id, display_name, country_code,
         canonical_code, mapping_status, verified_at)
      VALUES (
        '${INVALID_IDENTITY}',
        (SELECT id FROM operations.providers WHERE code = 'REMEDIATION_TEST_PROVIDER'),
        'stable-league-1', 'Test League', 'IT', 'ITA_TEST_LEAGUE',
        'CONFIRMED', '2026-01-01T00:00:00Z'
      ) ON CONFLICT DO NOTHING;

      INSERT INTO catalog.events
        (id, sport_id, competition_id, starts_at, status, synthetic)
      SELECT id_value, s.id, c.id, starts_at, 'FT', false
      FROM (
        VALUES
          ('${REPAIRABLE_EVENT}'::uuid, '2026-01-02T12:00:00Z'::timestamptz),
          ('${UNRESOLVED_EVENT}'::uuid, '2026-01-03T12:00:00Z'::timestamptz)
      ) fixture(id_value, starts_at)
      CROSS JOIN LATERAL (SELECT id FROM catalog.sports WHERE code = 'FOOTBALL' LIMIT 1) s
      CROSS JOIN LATERAL (SELECT id FROM catalog.competitions ORDER BY created_at LIMIT 1) c
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO operations.source_observations
        (id, provider_id, sync_run_id, observation_type, provider_external_id,
         provider_observed_at, received_at, normalized_at,
         normalization_version, mapping_version, content_hash)
      VALUES (
        '91000000-0000-4000-8000-000000000013',
        (SELECT id FROM operations.providers WHERE code = 'REMEDIATION_TEST_PROVIDER'),
        '91000000-0000-4000-8000-000000000012', 'ODDS', 'stable-fixture-1',
        '2026-01-02T10:00:00Z', '2026-01-02T10:00:01Z', '2026-01-02T10:00:02Z',
        'test', 'test', 'identity-remediation-test'
      ) ON CONFLICT DO NOTHING;

      INSERT INTO market.event_markets
        (id, event_id, market_definition_id, canonical_key)
      SELECT '91000000-0000-4000-8000-000000000014', '${REPAIRABLE_EVENT}', id,
             '${REPAIRABLE_EVENT}:remediation-test'
      FROM market.market_definitions ORDER BY created_at LIMIT 1
      ON CONFLICT DO NOTHING;

      INSERT INTO market.event_market_outcomes
        (id, event_market_id, market_definition_id, outcome_definition_id, canonical_key)
      SELECT '91000000-0000-4000-8000-000000000015',
             '91000000-0000-4000-8000-000000000014', em.market_definition_id,
             od.id, '${REPAIRABLE_EVENT}:remediation-test:outcome'
      FROM market.event_markets em
      JOIN market.outcome_definitions od ON od.market_definition_id = em.market_definition_id
      WHERE em.id = '91000000-0000-4000-8000-000000000014'
      ORDER BY od.sort_order LIMIT 1
      ON CONFLICT DO NOTHING;

      INSERT INTO market.bookmakers (id, code, display_name, synthetic)
      VALUES (
        '91000000-0000-4000-8000-000000000016',
        'remediation-test-book', 'Remediation Test Book', false
      ) ON CONFLICT DO NOTHING;

      INSERT INTO market.odds_observations
        (id, source_observation_id, event_market_outcome_id, bookmaker_id,
         decimal_odds, provider_observed_at, received_at, normalized_at,
         status, is_synthetic)
      VALUES (
        '91000000-0000-4000-8000-000000000017',
        '91000000-0000-4000-8000-000000000013',
        '91000000-0000-4000-8000-000000000015',
        '91000000-0000-4000-8000-000000000016', 1.85,
        '2026-01-02T10:00:00Z', '2026-01-02T10:00:01Z', '2026-01-02T10:00:02Z',
        'ACTIVE', false
      ) ON CONFLICT DO NOTHING;

      ALTER TABLE catalog.competition_identities
        ADD CONSTRAINT competition_identities_confirmed_requires_catalog
        CHECK (mapping_status <> 'CONFIRMED' OR competition_id IS NOT NULL)
        NOT VALID;
      ALTER TABLE catalog.events ENABLE TRIGGER events_provenance_required;
    `);
  });

  afterAll(async () => {
    // The database is disposable and dropped by test:db:local. Avoid
    // weakening append-only production invariants merely to clean fixtures.
    await client.close();
  });

  it("repairs only stable provider evidence, demotes false confirmations, and is dry-run/idempotent", async () => {
    const before = await diagnoseIdentityAnomalies(client.pool);
    expect(before).toMatchObject({
      eventOrphans: baseline.eventOrphans + 2,
      deterministicEventRepairs: baseline.deterministicEventRepairs + 1,
      confirmedWithoutCompetition: baseline.confirmedWithoutCompetition + 1,
    });

    const dryRun = await remediateIdentityAnomalies(client.pool, {
      dryRun: true,
      expectedEventRepairs: baseline.deterministicEventRepairs + 1,
      expectedCompetitionDemotions: baseline.confirmedWithoutCompetition + 1,
    });
    expect(dryRun).toMatchObject({
      eventIdentitiesInserted: baseline.deterministicEventRepairs + 1,
      competitionIdentitiesDemoted: baseline.confirmedWithoutCompetition + 1,
    });
    expect(await diagnoseIdentityAnomalies(client.pool)).toEqual(before);

    const applied = await remediateIdentityAnomalies(client.pool, {
      dryRun: false,
      expectedEventRepairs: baseline.deterministicEventRepairs + 1,
      expectedCompetitionDemotions: baseline.confirmedWithoutCompetition + 1,
    });
    expect(applied).toMatchObject({
      eventIdentitiesInserted: baseline.deterministicEventRepairs + 1,
      competitionIdentitiesDemoted: baseline.confirmedWithoutCompetition + 1,
    });

    const after = await diagnoseIdentityAnomalies(client.pool);
    expect(after).toMatchObject({
      eventOrphans:
        baseline.eventOrphans - baseline.deterministicEventRepairs + 1,
      deterministicEventRepairs: 0,
      confirmedWithoutCompetition: 0,
    });

    const rerun = await remediateIdentityAnomalies(client.pool, {
      dryRun: false,
      expectedEventRepairs: baseline.deterministicEventRepairs + 1,
      expectedCompetitionDemotions: baseline.confirmedWithoutCompetition + 1,
    });
    expect(rerun).toMatchObject({
      eventIdentitiesInserted: 0,
      competitionIdentitiesDemoted: 0,
    });

    const identity = await client.pool.query<{ provider_fixture_id: string }>(
      `SELECT provider_fixture_id FROM catalog.event_identities WHERE event_id = $1`,
      [REPAIRABLE_EVENT],
    );
    expect(identity.rows).toEqual([
      { provider_fixture_id: "stable-fixture-1" },
    ]);
  });
});
