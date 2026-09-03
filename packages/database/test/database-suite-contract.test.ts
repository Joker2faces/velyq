import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const testsDirectory = resolve(import.meta.dirname, "../../../supabase/tests");

function sqlTest(name: string): string {
  return readFileSync(resolve(testsDirectory, name), "utf8").toLowerCase();
}

function authenticatedSession(sql: string, userId: string): string {
  return (
    sql.match(
      new RegExp(
        `set local request\\.jwt\\.claim\\.sub = '${userId}';\\s*set local role authenticated;([\\s\\S]*?)reset role;`,
      ),
    )?.[1] ?? ""
  );
}

function roleSession(sql: string, role: string): string {
  return (
    sql.match(
      new RegExp(`set local role ${role};([\\s\\S]*?)reset role;`),
    )?.[1] ?? ""
  );
}

describe("real pgTAP database suite", () => {
  it("keeps every declared pgTAP plan aligned with its assertions", () => {
    for (const file of [
      "append_only_test.sql",
      "constraints_test.sql",
      "jobs_contract_test.sql",
      "profiles_rls_test.sql",
      "schema_contract_test.sql",
      "semantic_identity_test.sql",
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

  it("executes semantic-parent mutation and durable-job state assertions", () => {
    const jobs = sqlTest("jobs_contract_test.sql");
    const semantics = sqlTest("semantic_identity_test.sql");

    expect(semantics).toMatch(
      /update market\.market_definitions set line_required = true[\s\S]+55000/,
    );
    expect(semantics).toMatch(
      /update market\.event_markets set market_definition_id[\s\S]+stale outcomes/,
    );
    expect(semantics).toMatch(
      /update market\.outcome_definitions set market_definition_id[\s\S]+duplicate an identity/,
    );
    expect(semantics).toMatch(
      /update market\.event_market_outcomes set canonical_key[\s\S]+canonical key is immutable/,
    );

    for (const assertion of [
      "attempt_count cannot be negative",
      "max_attempts must be positive",
      "attempt_count cannot exceed max_attempts",
      "unknown job statuses are rejected",
      "pending jobs cannot retain a lease",
      "running jobs require a start timestamp",
      "completed jobs require a completion timestamp",
      "failed jobs preserve a structured error",
      "terminal jobs cannot retain a lease",
    ]) {
      expect(jobs).toContain(assertion);
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

  it("executes distinct owner, other-user, and privileged profile writes", () => {
    const sql = sqlTest("profiles_rls_test.sql");
    const owner = authenticatedSession(
      sql,
      "00000000-0000-4000-8000-000000000001",
    );
    const otherUser = authenticatedSession(
      sql,
      "00000000-0000-4000-8000-000000000002",
    );
    const service = roleSession(sql, "service_role");

    expect(sql).toContain("set local role anon");
    expect(owner).toMatch(/insert into public\.profiles[\s\S]+42501/);
    expect(otherUser).toMatch(
      /select count\(\*\) from public\.profiles where user_id = '00000000-0000-4000-8000-000000000001'[\s\S]+0::bigint/,
    );
    expect(otherUser).toMatch(
      /update public\.profiles set display_name = 'other updated' where user_id = '00000000-0000-4000-8000-000000000002'/,
    );
    expect(otherUser).toMatch(
      /set display_name = 'blocked other-user update'[\s\S]+where user_id = '00000000-0000-4000-8000-000000000001'[\s\S]+0::bigint/,
    );
    expect(service).toMatch(
      /insert into public\.profiles[\s\S]+server-created profile[\s\S]+select display_name/,
    );
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
    for (const assertion of [
      "duplicate identity with null subject and null line",
      "duplicate identity with null subject and a valued line",
      "duplicate identity with a non-null subject and valued line",
      "a different subject remains a distinct natural identity",
      "a different line remains a distinct natural identity",
    ]) {
      expect(constraints).toContain(assertion);
    }

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
