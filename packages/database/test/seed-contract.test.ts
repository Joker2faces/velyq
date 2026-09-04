import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { phaseOneTables } from "../src/schema/index.js";

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

function insertedColumns(sql: string): ReadonlyMap<string, readonly string[]> {
  return new Map(
    [...sql.matchAll(/insert into\s+([a-z_]+\.[a-z_]+)\s*\(([^)]+)\)/g)].map(
      ([, table, columnList]) => [
        table,
        columnList.split(",").map((column) => column.trim()),
      ],
    ),
  );
}

function splitSqlValues(tuple: string): readonly string[] {
  const values: string[] = [];
  let start = 0;
  let parentheses = 0;
  let brackets = 0;
  let quoted = false;

  for (let index = 0; index < tuple.length; index += 1) {
    const character = tuple[index];

    if (character === "'" && quoted && tuple[index + 1] === "'") {
      index += 1;
      continue;
    }

    if (character === "'") {
      quoted = !quoted;
      continue;
    }

    if (quoted) continue;
    if (character === "(") parentheses += 1;
    if (character === ")") parentheses -= 1;
    if (character === "[") brackets += 1;
    if (character === "]") brackets -= 1;

    if (character === "," && parentheses === 0 && brackets === 0) {
      values.push(tuple.slice(start, index).trim());
      start = index + 1;
    }
  }

  values.push(tuple.slice(start).trim());
  return values;
}

function valueTupleArities(sql: string): readonly Readonly<{
  table: string;
  columnCount: number;
  valueCount: number;
}>[] {
  const results: Array<{
    table: string;
    columnCount: number;
    valueCount: number;
  }> = [];
  const insertPattern =
    /insert into\s+([a-z_]+\.[a-z_]+)\s*\(([^)]+)\)\s*values\s*/g;

  for (const insert of sql.matchAll(insertPattern)) {
    const table = insert[1];
    const columnCount = insert[2].split(",").length;
    const bodyStart = (insert.index ?? 0) + insert[0].length;
    let tupleStart = -1;
    let depth = 0;
    let quoted = false;

    for (let index = bodyStart; index < sql.length; index += 1) {
      const character = sql[index];

      if (character === "'" && quoted && sql[index + 1] === "'") {
        index += 1;
        continue;
      }

      if (character === "'") {
        quoted = !quoted;
        continue;
      }

      if (quoted) continue;
      if (character === ";" && depth === 0) break;

      if (character === "(") {
        if (depth === 0) tupleStart = index + 1;
        depth += 1;
      } else if (character === ")") {
        depth -= 1;
        if (depth === 0 && tupleStart >= 0) {
          results.push({
            table,
            columnCount,
            valueCount: splitSqlValues(sql.slice(tupleStart, index)).length,
          });
          tupleStart = -1;
        }
      }
    }
  }

  return results;
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
      "customer.read",
      "admin.access",
      "provider_runs.read",
      "predictions.trace",
      "scores.inspect",
      "quality.inspect",
      "audit.read",
      "synthetic-fixtures",
      "development_heuristic",
      "football_full_time_1x2",
      "football_full_time_total",
      "football_1x2_full_time_v1",
      "football_total_2_5_full_time_v1",
    ]) {
      expect(sql).toContain(requiredValue);
    }

    expect(sql).toContain("insert into operations.provider_policy_versions");
    expect(sql).toContain(
      "from private.permissions\nwhere code = 'customer.read'",
    );
    expect(sql).toContain(
      "insert into intelligence.data_quality_policy_versions",
    );
    expect(sql).toContain("insert into intelligence.model_versions");
    expect(sql).toContain("insert into intelligence.score_definition_versions");
    expect(sql).toContain("insert into market.market_definitions");
  });

  it("supplies fixed UTC values for every seeded defaulted timestamp", () => {
    const sql = seedSql();
    const columnsByTable = insertedColumns(sql);

    for (const table of phaseOneTables) {
      const config = getTableConfig(table);
      const qualifiedName = `${config.schema ?? "public"}.${config.name}`;
      const inserted = columnsByTable.get(qualifiedName);

      if (!inserted) continue;

      for (const column of config.columns.filter(
        (candidate) =>
          candidate.hasDefault &&
          candidate.getSQLType() === "timestamp with time zone",
      )) {
        expect(inserted, `${qualifiedName}.${column.name}`).toContain(
          column.name,
        );
      }
    }

    expect(columnsByTable.get("auth.users")).toEqual(
      expect.arrayContaining(["created_at", "updated_at"]),
    );
    expect(sql).not.toMatch(
      /(?:\b(?:current_timestamp|default)\b|\b(?:now|statement_timestamp|clock_timestamp)\s*\(\s*\))/,
    );

    for (const [, timestamp] of sql.matchAll(
      /'(\d{4}-\d{2}-\d{2}t\d{2}:\d{2}:\d{2}(?:\.\d+)?z)'/g,
    )) {
      expect(timestamp).toMatch(/z$/);
    }
  });

  it("provides one value for every declared column in each seed row", () => {
    const arities = valueTupleArities(seedSql());

    expect(arities.length).toBeGreaterThan(0);
    for (const { table, columnCount, valueCount } of arities) {
      expect(valueCount, table).toBe(columnCount);
    }
  });
});
