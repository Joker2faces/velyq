import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const testsDirectory = resolve(import.meta.dirname, "../../../supabase/tests");

function sqlTest(name: string): string {
  return readFileSync(resolve(testsDirectory, name), "utf8").toLowerCase();
}

describe("real pgTAP database suite", () => {
  it("keeps every declared pgTAP plan aligned with its assertions", () => {
    for (const file of [
      "append_only_test.sql",
      "constraints_test.sql",
      "profiles_rls_test.sql",
      "schema_contract_test.sql",
      "security_boundaries_test.sql",
    ]) {
      const sql = sqlTest(file);
      const declaredPlan = Number(sql.match(/select plan\((\d+)\)/)?.[1]);
      const assertionCount = (
        sql.match(/select\s+(?:is|set_eq|ok|throws_ok|lives_ok)\s*\(/g) ?? []
      ).length;

      expect(assertionCount, file).toBe(declaredPlan);
    }
  });

  it("attempts update and delete for every append-only table", () => {
    const sql = sqlTest("append_only_test.sql");

    for (const table of [
      "operations.source_observations",
      "market.odds_observations",
      "intelligence.data_quality_assessments",
      "intelligence.predictions",
      "intelligence.prediction_inputs",
      "intelligence.score_results",
      "intelligence.radar_evidence",
      "audit.admin_audit_events",
    ]) {
      expect(sql).toContain(`update ${table}`);
      expect(sql).toContain(`delete from ${table}`);
    }
  });

  it("covers anonymous, owner, other-user, normal-user, and service paths", () => {
    const sql = sqlTest("profiles_rls_test.sql");

    expect(sql).toContain("set local role anon");
    expect(sql).toContain("set local role authenticated");
    expect(sql).toContain("set local role service_role");
    expect(sql).toContain("00000000-0000-4000-8000-000000000001");
    expect(sql).toContain("00000000-0000-4000-8000-000000000002");
    expect(sql).toContain("00000000-0000-4000-8000-000000000003");
  });

  it("executes allowlist, constraint, index, and internal-schema assertions", () => {
    const schema = sqlTest("schema_contract_test.sql");
    const constraints = sqlTest("constraints_test.sql");
    const security = sqlTest("security_boundaries_test.sql");

    expect(schema).toContain("35");
    expect(schema).toContain("pg_indexes");
    expect(schema).toContain("future phase tables are absent");
    expect(constraints).toContain("'nan'::numeric");
    expect(constraints).toContain("lineup_observations_players_array_check");
    expect(constraints).toContain("event market outcome");
    expect(constraints).toContain(
      "markets without a line reject unexpected line values",
    );
    expect(constraints).toContain(
      "line-based markets reject missing line values",
    );

    for (const internalSchema of [
      "audit",
      "catalog",
      "intelligence",
      "market",
      "operations",
      "private",
    ]) {
      expect(security).toContain(internalSchema);
    }
  });
});
