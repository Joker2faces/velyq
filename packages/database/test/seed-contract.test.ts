import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const seedPath = resolve(import.meta.dirname, "../../../supabase/seed.sql");

function seedSql(): string {
  try {
    return readFileSync(seedPath, "utf8").toLowerCase();
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return "";
    }

    throw error;
  }
}

describe("deterministic Phase 1 seed", () => {
  it("creates the three local database identity fixtures", () => {
    const sql = seedSql();

    for (const id of [
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
      "00000000-0000-4000-8000-000000000003",
    ]) {
      expect(sql).toContain(id);
    }

    expect(sql).toContain("insert into auth.users");
    expect(sql).toContain("insert into public.profiles");
  });

  it("seeds authorization and all required versioned definitions", () => {
    const sql = seedSql();

    for (const requiredValue of [
      "admin.access",
      "provider_runs.read",
      "predictions.trace",
      "scores.inspect",
      "quality.inspect",
      "audit.read",
      "synthetic-fixtures",
      "development_heuristic",
      "match_result.full_time",
      "total.full_time",
    ]) {
      expect(sql).toContain(requiredValue);
    }

    expect(sql).toContain("insert into operations.provider_policy_versions");
    expect(sql).toContain(
      "insert into intelligence.data_quality_policy_versions",
    );
    expect(sql).toContain("insert into intelligence.model_versions");
    expect(sql).toContain("insert into intelligence.score_definition_versions");
    expect(sql).toContain("insert into market.market_definitions");
  });
});
