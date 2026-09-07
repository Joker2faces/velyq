import { describe, expect, it } from "vitest";
import {
  localMigrations,
  parseMigrationFileName,
  planMigrations,
} from "../scripts/supabase-migrate.mjs";

describe("migration filenames", () => {
  it("reads the version and name", () => {
    expect(
      parseMigrationFileName("20260908140000_lineup_coverage.sql"),
    ).toEqual({ version: "20260908140000", name: "lineup_coverage" });
  });

  it("ignores anything that is not a versioned migration", () => {
    for (const name of ["seed.sql", "notes.txt", "2026_short.sql"])
      expect(parseMigrationFileName(name)).toBeNull();
  });

  it("never sees the seed, because it is not in the migrations directory", () => {
    // The seed is local fixture data and applying it to production would
    // write synthetic events into a real catalog. This asserts the structural
    // reason that cannot happen rather than trusting a code path.
    expect(
      localMigrations().some((entry) => entry.fileName.includes("seed")),
    ).toBe(false);
  });

  it("returns the real migrations in version order", () => {
    const migrations = localMigrations();
    expect(migrations.length).toBeGreaterThan(0);
    const versions = migrations.map((entry) => entry.version);
    expect([...versions].sort()).toEqual(versions);
  });
});

describe("planning against a remote state", () => {
  const local = [
    { version: "001", name: "a", fileName: "001_a.sql" },
    { version: "002", name: "b", fileName: "002_b.sql" },
    { version: "003", name: "c", fileName: "003_c.sql" },
  ];

  it("applies only what is absent, and never re-runs", () => {
    const plan = planMigrations(local, ["001", "002"]);
    expect(plan.pending.map((entry) => entry.version)).toEqual(["003"]);
    expect(plan.alreadyApplied).toBe(2);
  });

  it("plans nothing when the remote is already synchronized", () => {
    expect(planMigrations(local, ["001", "002", "003"]).pending).toEqual([]);
  });

  it("surfaces a back-dated migration rather than hiding it", () => {
    /*
     * 20260907124500 is exactly this case in the real repository: additive,
     * idempotent, and timestamped before a migration already applied. Safe to
     * apply late, and the operator should still be told.
     */
    const plan = planMigrations(local, ["001", "003"]);
    expect(plan.pending.map((entry) => entry.version)).toEqual(["002"]);
    expect(plan.outOfOrder.map((entry) => entry.version)).toEqual(["002"]);
  });

  it("reports no out-of-order entries against an empty remote", () => {
    const plan = planMigrations(local, []);
    expect(plan.pending).toHaveLength(3);
    expect(plan.outOfOrder).toEqual([]);
  });
});
