import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";

const EXPECTED_PHASE_ONE_TABLES = [
  "audit.admin_audit_events",
  "catalog.competition_identities",
  "catalog.competitions",
  "catalog.event_identities",
  "catalog.event_participants",
  "catalog.events",
  "catalog.participants",
  "catalog.sports",
  "intelligence.calibration_versions",
  "intelligence.data_quality_assessments",
  "intelligence.data_quality_policy_versions",
  "intelligence.lineup_observations",
  "intelligence.model_definitions",
  "intelligence.model_versions",
  "intelligence.prediction_inputs",
  "intelligence.prediction_runs",
  "intelligence.predictions",
  "intelligence.radar_evidence",
  "intelligence.score_definition_versions",
  "intelligence.score_results",
  "market.bookmakers",
  "market.event_market_outcomes",
  "market.event_markets",
  "market.market_definitions",
  "market.odds_observations",
  "market.outcome_definitions",
  "market.provider_market_mappings",
  "operations.jobs",
  "operations.provider_ingestion_runs",
  "operations.provider_policy_versions",
  "operations.provider_quota_state",
  "operations.provider_sync_runs",
  "operations.providers",
  "operations.source_observations",
  "private.permissions",
  "private.role_permissions",
  "private.roles",
  "private.user_roles",
  "public.profiles",
] as const;

async function loadPhaseOneTableNames(): Promise<readonly string[]> {
  try {
    const schema = await import("../src/schema/index.js");
    return schema.phaseOneTables
      .map((table) => {
        const config = getTableConfig(table);
        return `${config.schema ?? "public"}.${config.name}`;
      })
      .sort();
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes("src/schema/index") ||
        error.message.includes("phaseOneTables"))
    ) {
      return [];
    }

    throw error;
  }
}

describe("Phase 1 database schema allowlist", () => {
  it("exports exactly the 39 approved qualified table names", async () => {
    const tableNames = await loadPhaseOneTableNames();

    expect(tableNames).toEqual(EXPECTED_PHASE_ONE_TABLES);
    expect(new Set(tableNames).size).toBe(39);
  });

  /*
   * Guards a real gap found while building the odds write path:
   * `databaseSchema` (schema/database.ts) is a second, separately maintained
   * table list that powers `db.query.*` -- adding a table to `phaseOneTables`
   * does not add it here. A table missing from `databaseSchema` still
   * migrates and typechecks fine; `db.query.<table>.findFirst(...)` on it
   * throws only at runtime, which is exactly how this was discovered.
   *
   * `databaseSchema` is a superset of `phaseOneTables`, not an exact match:
   * the billing tables are deliberately queryable (`databaseSchema`) while
   * staying outside the reviewed Phase 1 allowlist above -- billing remains
   * a deferred, separately-governed concern.
   */
  it("registers every phase-one table in the databaseSchema relational query map", async () => {
    const { phaseOneTables } = await import("../src/schema/index.js");
    const { databaseSchema } = await import("../src/schema/database.js");

    const phaseOneTableNames = new Set(
      phaseOneTables.map((table) => getTableConfig(table).name),
    );
    const databaseSchemaTableNames = new Set(
      Object.values(databaseSchema).map((table) => getTableConfig(table).name),
    );

    for (const name of phaseOneTableNames) {
      expect(databaseSchemaTableNames.has(name)).toBe(true);
    }
  });
});
