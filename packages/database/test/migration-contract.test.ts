import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../../..");

const EXPECTED_TABLES = [
  "audit.admin_audit_events",
  "catalog.competitions",
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
  "operations.provider_policy_versions",
  "operations.provider_sync_runs",
  "operations.providers",
  "operations.source_observations",
  "private.permissions",
  "private.role_permissions",
  "private.roles",
  "private.user_roles",
  "public.profiles",
] as const;

const APPEND_ONLY_TABLES = [
  "audit.admin_audit_events",
  "intelligence.data_quality_assessments",
  "intelligence.prediction_inputs",
  "intelligence.predictions",
  "intelligence.radar_evidence",
  "intelligence.score_results",
  "market.odds_observations",
  "operations.source_observations",
] as const;

function migrationSql(): string {
  const migrationsDirectory = resolve(ROOT, "supabase/migrations");

  try {
    return readdirSync(migrationsDirectory)
      .filter((file) => file.endsWith(".sql"))
      .sort()
      .map((file) => readFileSync(resolve(migrationsDirectory, file), "utf8"))
      .join("\n")
      .toLowerCase();
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return "";
    }

    throw error;
  }
}

function normalizeSql(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function createdTables(sql: string): string[] {
  return [
    ...sql.matchAll(
      /create table\s+(?:if not exists\s+)?(?:"?([a-z_]+)"?\.)?"?([a-z_]+)"?/g,
    ),
  ]
    .map(([, schema = "public", table]) => `${schema}.${table}`)
    .sort();
}

function appendOnlyTargets(sql: string): string[] {
  return [
    ...sql.matchAll(
      /create trigger\s+reject_([a-z_]+)_([a-z_]+)_mutation[\s\S]*?on\s+([a-z_]+)\.([a-z_]+)/g,
    ),
  ]
    .map(([, , , schema, table]) => `${schema}.${table}`)
    .sort();
}

describe("reviewed Phase 1 migration contract", () => {
  it("creates exactly the approved 35-table allowlist", () => {
    expect(createdTables(migrationSql())).toEqual(EXPECTED_TABLES);
  });

  it("preserves exact decimal storage and rejects numeric special values", () => {
    const sql = migrationSql();

    expect(sql).toMatch(/"?line_value"?\s+numeric\(12,\s*4\)/);
    expect(sql).toMatch(/"?decimal_odds"?\s+numeric\(18,\s*8\)/);
    expect(sql).toMatch(/"?confidence"?\s+numeric\(8,\s*7\)/);
    expect(sql).toMatch(/"?numeric_score"?\s+numeric\(8,\s*4\)/);
    expect(sql).toMatch(/"?model_probability"?\s+numeric\(18,\s*12\)/);
    expect(sql).toMatch(/"?fair_odds"?\s+numeric\(18,\s*8\)/);
    expect(sql).toMatch(/"?score"?\s+numeric\(8,\s*4\)/);

    for (const constraint of [
      "event_markets_line_value_finite_check",
      "odds_observations_decimal_odds_check",
      "lineup_observations_confidence_check",
      "data_quality_assessments_numeric_score_finite_check",
      "predictions_model_probability_check",
      "predictions_edge_finite_check",
      "predictions_expected_value_finite_check",
      "score_results_score_check",
    ]) {
      expect(sql).toContain(constraint);
    }
  });

  it("adds the lineup schema-version and canonical JSON-array boundary", () => {
    const sql = migrationSql();

    expect(sql).toMatch(/"?schema_version"?\s+text\s+not null/);
    expect(sql).toContain("lineup_observations_players_array_check");
    expect(sql).toMatch(/jsonb_typeof\s*\([^)]*"?players"?\)\s*=\s*'array'/);
  });

  it("enforces canonical market line presence against the definition", () => {
    const sql = migrationSql();

    expect(sql).toContain("enforce_event_market_identity");
    expect(sql).toContain(
      "event market line presence must match its market definition",
    );
  });

  it("makes every canonical market identity immutable after creation", () => {
    const sql = migrationSql();

    expect(sql).toContain("reject_semantic_identity_mutation");

    for (const trigger of [
      "protect_market_definitions_semantic_identity",
      "protect_outcome_definitions_semantic_identity",
      "protect_event_markets_semantic_identity",
      "protect_event_market_outcomes_semantic_identity",
    ]) {
      expect(sql).toContain(trigger);
    }

    expect(sql).toMatch(
      /before update of\s+id,\s*sport_id,\s*code,\s*family_code,\s*period_code,\s*structure,\s*subject_type,\s*line_required,\s*line_rules,\s*settlement_rule_version\s+on market\.market_definitions/,
    );
    expect(sql).toMatch(
      /before update of\s+id,\s*market_definition_id,\s*code\s+on market\.outcome_definitions/,
    );
    expect(sql).toMatch(
      /before update of\s+id,\s*event_id,\s*market_definition_id,\s*subject_participant_id,\s*line_value,\s*canonical_key\s+on market\.event_markets/,
    );
    expect(sql).toMatch(
      /before update of\s+id,\s*event_market_id,\s*market_definition_id,\s*outcome_definition_id,\s*canonical_key\s+on market\.event_market_outcomes/,
    );
  });

  it("adds durable job invariants and the event-outcome composite child index", () => {
    const sql = migrationSql();

    expect(sql).toMatch(/add column "?causation_id"?\s+uuid/);
    expect(sql).toMatch(/alter column "?causation_id"?\s+set not null/);

    for (const constraint of [
      "jobs_attempt_count_nonnegative_check",
      "jobs_max_attempts_positive_check",
      "jobs_attempt_count_within_max_check",
      "jobs_status_check",
      "jobs_state_check",
    ]) {
      expect(sql).toContain(constraint);
    }

    expect(sql).toMatch(
      /create index "?event_market_outcomes_definition_outcome_idx"?[^;]+\("?market_definition_id"?,\s*"?outcome_definition_id"?\)/,
    );
  });

  it("enforces event-market natural identity across nullable components", () => {
    const sql = migrationSql();

    expect(sql).toMatch(
      /constraint\s+"?event_markets_natural_identity_unique"?\s+unique\s+nulls\s+not\s+distinct\s*\(\s*"?event_id"?\s*,\s*"?market_definition_id"?\s*,\s*"?subject_participant_id"?\s*,\s*"?line_value"?\s*\)/,
    );
  });

  it("keeps the natural-identity Supabase delta aligned with Drizzle", () => {
    const drizzleDirectory = resolve(ROOT, "packages/database/drizzle");
    const migrationDirectory = resolve(ROOT, "supabase/migrations");
    const drizzleDelta = readFileSync(
      resolve(
        drizzleDirectory,
        readdirSync(drizzleDirectory)
          .filter((file) => /^0002_.+\.sql$/.test(file))
          .toSorted()
          .at(-1) ?? "missing-drizzle-natural-identity-delta.sql",
      ),
      "utf8",
    );
    const supabaseDelta = readFileSync(
      resolve(
        migrationDirectory,
        readdirSync(migrationDirectory)
          .filter((file) =>
            file.endsWith("_canonicalize_persisted_uuid_identities.sql"),
          )
          .toSorted()
          .at(-1) ?? "missing-supabase-natural-identity-delta.sql",
      ),
      "utf8",
    );
    const normalizedSupabase = normalizeSql(supabaseDelta);

    for (const statement of drizzleDelta
      .split(/-->\s*statement-breakpoint/)
      .map(normalizeSql)
      .filter(Boolean)) {
      expect(normalizedSupabase).toContain(statement);
    }
  });

  it("keeps the reviewed Supabase schema delta aligned with Drizzle", () => {
    const drizzleDirectory = resolve(ROOT, "packages/database/drizzle");
    const migrationDirectory = resolve(ROOT, "supabase/migrations");
    const drizzleDelta = readFileSync(
      resolve(
        drizzleDirectory,
        readdirSync(drizzleDirectory)
          .filter((file) => /^0001_.+\.sql$/.test(file))
          .toSorted()
          .at(-1) ?? "missing-drizzle-delta.sql",
      ),
      "utf8",
    );
    const supabaseDelta = readFileSync(
      resolve(
        migrationDirectory,
        readdirSync(migrationDirectory)
          .filter((file) =>
            file.endsWith("_enforce_database_integrity_contracts.sql"),
          )
          .toSorted()
          .at(-1) ?? "missing-supabase-delta.sql",
      ),
      "utf8",
    );
    const normalizedSupabase = normalizeSql(supabaseDelta);

    for (const statement of drizzleDelta
      .split(/-->\s*statement-breakpoint/)
      .map(normalizeSql)
      .filter(Boolean)) {
      expect(normalizedSupabase).toContain(statement);
    }

    expect(
      normalizedSupabase.indexOf('addcolumn"causation_id"uuid'),
    ).toBeLessThan(
      normalizedSupabase.indexOf('altercolumn"causation_id"setnotnull'),
    );
    expect(
      normalizedSupabase.indexOf(
        'constraint"event_markets_id_market_definition_id_unique"',
      ),
    ).toBeLessThan(
      normalizedSupabase.indexOf(
        'constraint"event_market_outcomes_event_market_definition_fk"',
      ),
    );
  });

  it("protects exactly the eight approved append-only histories", () => {
    expect(appendOnlyTargets(migrationSql())).toEqual(APPEND_ONLY_TABLES);
  });

  it("keeps browser access owner-scoped to profiles", () => {
    const sql = migrationSql();

    expect(sql).toContain(
      "alter table public.profiles enable row level security",
    );
    expect(sql).toContain("profiles_owner_select");
    expect(sql).toContain("profiles_owner_update");
    expect(sql).toMatch(
      /using\s*\(\s*\(select auth\.uid\(\)\)\s*=\s*user_id\s*\)/,
    );
    expect(sql).toMatch(
      /with check\s*\(\s*\(select auth\.uid\(\)\)\s*=\s*user_id\s*\)/,
    );
    expect(sql).not.toContain("auth.role()");
    expect(sql).not.toContain("user_metadata");

    for (const schema of [
      "audit",
      "catalog",
      "intelligence",
      "market",
      "operations",
      "private",
    ]) {
      expect(sql).toContain(
        `revoke all on schema ${schema} from anon, authenticated`,
      );
    }
  });

  it("uses restrictive deletion for history with only the profile cascade", () => {
    const sql = migrationSql();
    const cascades = sql.match(/on delete cascade/g) ?? [];

    expect(cascades).toHaveLength(1);
    expect(sql).toMatch(
      /alter table "?profiles"? add constraint [\s\S]*?references "?auth"?\."?users"?\s*\(\s*"?id"?\s*\) on delete cascade/,
    );
    expect(sql).not.toContain("on delete set null");
  });
});
