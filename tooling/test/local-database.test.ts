import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertLocalConnection,
  migrationFiles,
  resolveStage,
} from "../scripts/local-database.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");

function allMigrationSql() {
  return readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => ({
      name,
      sql: readFileSync(path.join(MIGRATIONS, name), "utf8"),
    }));
}

describe("local database applier", () => {
  it("refuses a non-loopback host unless explicitly allowed", () => {
    expect(() =>
      assertLocalConnection("postgresql://u:p@db.example.com:5432/velyq"),
    ).toThrow(/non-loopback/);
    expect(
      assertLocalConnection("postgresql://u:p@db.example.com:5432/velyq", true)
        .hostname,
    ).toBe("db.example.com");
  });

  it("accepts loopback hosts", () => {
    for (const host of ["localhost", "127.0.0.1"])
      expect(
        assertLocalConnection(`postgresql://postgres@${host}:55433/velyq`)
          .hostname,
      ).toBe(host);
  });

  it("applies migrations in filename order", () => {
    const files = migrationFiles(MIGRATIONS);
    expect(files.length).toBeGreaterThan(0);
    expect([...files].sort()).toEqual(files);
  });

  it("rejects an unknown stage by name", () => {
    expect(() => resolveStage("nope")).toThrow(/Unknown stage/);
    expect(resolveStage("bootstrap")).toEqual(["shim", "migrate", "seed"]);
  });
});

/*
 * These three assertions each pin a defect that made the migration chain
 * un-appliable to an empty database, found by actually applying it to one.
 */
describe("migration chain applies to an empty database", () => {
  it("provisions the football sport and core market definitions in a migration, not only in the local seed", () => {
    const sql = allMigrationSql()
      .map((file) => file.sql)
      .join("\n")
      .toLowerCase();
    // Real API-Sports ingestion resolves event markets by these codes. If
    // they live only in seed.sql — which a hosted project never runs — the
    // insert matches nothing and no football odds are ever stored, silently.
    expect(sql).toContain("'football_full_time_1x2'");
    expect(sql).toContain("'football_full_time_total'");
    expect(sql).toContain("'football', 'sport.football'");
  });

  it("provisions the football catalog before the migration whose foreign keys need it", () => {
    const names = migrationFiles(MIGRATIONS);
    const provisions = names.findIndex((name) =>
      name.includes("provision_football_sport_and_core_markets"),
    );
    const consumes = names.findIndex((name) =>
      name.includes("provision_real_market_catalog"),
    );
    expect(provisions).toBeGreaterThanOrEqual(0);
    expect(consumes).toBeGreaterThanOrEqual(0);
    expect(provisions).toBeLessThan(consumes);
  });

  it("keeps the local seed appliable after the migrations that constrain it", () => {
    const seed = readFileSync(path.join(ROOT, "supabase/seed.sql"), "utf8");
    // `provision_customer_after_signup` creates a profile row for every
    // auth.users insert, so the seed's own profile insert must not collide.
    expect(seed).toMatch(
      /INSERT INTO public\.profiles[\s\S]*?ON CONFLICT \(user_id\) DO UPDATE/,
    );
    // score_results.idempotency_key became NOT NULL in 20260907133000.
    expect(seed).toMatch(
      /INSERT INTO intelligence\.score_results[\s\S]*?idempotency_key/,
    );
  });
});
