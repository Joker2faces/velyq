import type { Pool, PoolClient } from "pg";

type Queryable = Pick<Pool | PoolClient, "query">;

export type IdentityAnomalyDiagnosis = Readonly<{
  eventOrphans: number;
  deterministicEventRepairs: number;
  confirmedWithoutCompetition: number;
}>;

export type IdentityRemediationOptions = Readonly<{
  dryRun: boolean;
  expectedEventRepairs: number;
  expectedCompetitionDemotions: number;
}>;

export type IdentityRemediationResult = Readonly<{
  dryRun: boolean;
  eventIdentitiesInserted: number;
  competitionIdentitiesDemoted: number;
}>;

const EVENT_REPAIR_CANDIDATES = `
  WITH source_evidence AS (
    SELECT
      em.event_id,
      so.provider_id,
      so.provider_external_id
    FROM market.event_markets em
    JOIN market.event_market_outcomes emo ON emo.event_market_id = em.id
    JOIN market.odds_observations oo ON oo.event_market_outcome_id = emo.id
    JOIN operations.source_observations so ON so.id = oo.source_observation_id
    WHERE so.observation_type = 'ODDS'
      AND so.provider_external_id IS NOT NULL
      AND btrim(so.provider_external_id) <> ''
    GROUP BY em.event_id, so.provider_id, so.provider_external_id
  ), unambiguous AS (
    SELECT event_id
    FROM source_evidence
    GROUP BY event_id
    HAVING count(*) = 1
  )
  SELECT evidence.event_id, evidence.provider_id, evidence.provider_external_id
  FROM source_evidence evidence
  JOIN unambiguous USING (event_id)
  JOIN catalog.events event ON event.id = evidence.event_id
  WHERE event.synthetic = false
    AND NOT EXISTS (
      SELECT 1 FROM catalog.event_identities identity
      WHERE identity.event_id = evidence.event_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM catalog.event_identities identity
      WHERE identity.provider_id = evidence.provider_id
        AND identity.provider_fixture_id = evidence.provider_external_id
    )
`;

function asCount(value: unknown): number {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(`Invalid database count: ${String(value)}`);
  }
  return count;
}

export async function diagnoseIdentityAnomalies(
  database: Queryable,
): Promise<IdentityAnomalyDiagnosis> {
  const result = await database.query<{
    event_orphans: string;
    deterministic_event_repairs: string;
    confirmed_without_competition: string;
  }>(`
    SELECT
      (
        SELECT count(*) FROM catalog.events event
        WHERE event.synthetic = false
          AND NOT EXISTS (
            SELECT 1 FROM catalog.event_identities identity
            WHERE identity.event_id = event.id
          )
      )::text AS event_orphans,
      (SELECT count(*) FROM (${EVENT_REPAIR_CANDIDATES}) candidate)::text
        AS deterministic_event_repairs,
      (
        SELECT count(*) FROM catalog.competition_identities identity
        WHERE identity.mapping_status = 'CONFIRMED'
          AND identity.competition_id IS NULL
      )::text AS confirmed_without_competition
  `);
  const row = result.rows[0];
  if (!row) throw new Error("Identity anomaly diagnosis returned no row");
  return {
    eventOrphans: asCount(row.event_orphans),
    deterministicEventRepairs: asCount(row.deterministic_event_repairs),
    confirmedWithoutCompetition: asCount(row.confirmed_without_competition),
  };
}

function assertExpectedOrAlreadyApplied(
  actual: number,
  expected: number,
  label: string,
): void {
  if (actual !== expected && actual !== 0) {
    throw new Error(`${label}: expected ${expected} or 0, found ${actual}`);
  }
}

/**
 * Repairs only identities recoverable from a single stable provider/source
 * observation pair. A false CONFIRMED competition state is demoted rather
 * than guessed into a catalog mapping. The operation is locked,
 * transactional, count-guarded, dry-run capable, and contains no deletes.
 */
export async function remediateIdentityAnomalies(
  pool: Pool,
  options: IdentityRemediationOptions,
): Promise<IdentityRemediationResult> {
  const connection = await pool.connect();
  let completed = false;
  try {
    await connection.query("BEGIN");
    await connection.query(
      "LOCK TABLE catalog.event_identities, catalog.competition_identities IN SHARE ROW EXCLUSIVE MODE",
    );

    const before = await diagnoseIdentityAnomalies(connection);
    assertExpectedOrAlreadyApplied(
      before.deterministicEventRepairs,
      options.expectedEventRepairs,
      "Deterministic event repairs",
    );
    assertExpectedOrAlreadyApplied(
      before.confirmedWithoutCompetition,
      options.expectedCompetitionDemotions,
      "Confirmed competition demotions",
    );

    const inserted = await connection.query(`
      INSERT INTO catalog.event_identities
        (event_id, provider_id, provider_fixture_id)
      SELECT event_id, provider_id, provider_external_id
      FROM (${EVENT_REPAIR_CANDIDATES}) candidate
      ON CONFLICT (provider_id, provider_fixture_id) DO NOTHING
    `);

    const demoted = await connection.query(`
      UPDATE catalog.competition_identities
      SET mapping_status = 'PENDING_REVIEW',
          mapping_confidence = NULL,
          verified_at = NULL
      WHERE mapping_status = 'CONFIRMED'
        AND competition_id IS NULL
    `);

    const after = await diagnoseIdentityAnomalies(connection);
    if (
      after.deterministicEventRepairs !== 0 ||
      after.confirmedWithoutCompetition !== 0
    ) {
      throw new Error("Identity remediation postconditions failed");
    }

    const result = {
      dryRun: options.dryRun,
      eventIdentitiesInserted: inserted.rowCount ?? 0,
      competitionIdentitiesDemoted: demoted.rowCount ?? 0,
    };

    await connection.query(options.dryRun ? "ROLLBACK" : "COMMIT");
    completed = true;
    return result;
  } finally {
    if (!completed) await connection.query("ROLLBACK").catch(() => undefined);
    connection.release();
  }
}
