import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { marketLine } from "@velyq/decimal";
import { eventId } from "@velyq/domain";
import { describe, expect, it } from "vitest";

import {
  canonicalMarketDefinitions,
  createEventMarket,
  createMarketOutcome,
  serializeEventMarketKey,
  serializeMarketKey,
} from "../src/index.js";

const seed = readFileSync(
  resolve(import.meta.dirname, "../../../supabase/seed.sql"),
  "utf8",
);

function successful<T>(result: {
  readonly ok: boolean;
  readonly value?: T;
}): T {
  expect(result.ok).toBe(true);

  if (!result.ok || result.value === undefined) {
    throw new Error("Expected canonical market construction to succeed");
  }

  return result.value;
}

function insertRows(
  table: string,
): readonly Readonly<Record<string, string>>[] {
  const escapedTable = table.replaceAll(".", "\\.");
  const insert = seed.match(
    new RegExp(
      `INSERT\\s+INTO\\s+${escapedTable}\\s*\\(([^;]+?)\\)\\s*VALUES([\\s\\S]*?);`,
      "i",
    ),
  );

  if (!insert) return [];

  const columns = insert[1].split(",").map((column) => column.trim());

  return [...insert[2].matchAll(/\(([^()]+)\)/g)].map(([, row]) => {
    const values = row.split(/,(?=(?:[^']*'[^']*')*[^']*$)/).map((value) => {
      const token = value.trim();
      return (
        token.match(/^'((?:''|[^'])*)'/)?.[1].replaceAll("''", "'") ?? token
      );
    });

    return Object.fromEntries(
      columns.map((column, index) => [column, values[index] ?? ""]),
    );
  });
}

describe("database seed canonical market parity", () => {
  it("uses the approved definition codes and settlement versions", () => {
    const rows = insertRows("market.market_definitions");

    expect(rows.map((row) => [row.code, row.settlement_rule_version])).toEqual([
      [
        canonicalMarketDefinitions.FOOTBALL_FULL_TIME_1X2.code,
        canonicalMarketDefinitions.FOOTBALL_FULL_TIME_1X2.settlementRuleVersion,
      ],
      [
        canonicalMarketDefinitions.FOOTBALL_FULL_TIME_TOTAL.code,
        canonicalMarketDefinitions.FOOTBALL_FULL_TIME_TOTAL
          .settlementRuleVersion,
      ],
    ]);
  });

  it("matches serialized event and outcome keys exactly", () => {
    const seededEventId = successful(
      eventId("23000000-0000-4000-8000-000000000001"),
    );
    const fullTimeMarket = successful(
      createEventMarket({
        definition: canonicalMarketDefinitions.FOOTBALL_FULL_TIME_1X2,
        eventId: seededEventId,
      }),
    );
    const totalMarket = successful(
      createEventMarket({
        definition: canonicalMarketDefinitions.FOOTBALL_FULL_TIME_TOTAL,
        eventId: seededEventId,
        line: successful(marketLine("2.5")),
      }),
    );
    const eventKeys = insertRows("market.event_markets").map(
      (row) => row.canonical_key,
    );
    const outcomeKeys = insertRows("market.event_market_outcomes").map(
      (row) => row.canonical_key,
    );

    expect(eventKeys).toEqual([
      serializeEventMarketKey(fullTimeMarket),
      serializeEventMarketKey(totalMarket),
    ]);
    expect(outcomeKeys).toEqual([
      serializeMarketKey(
        successful(createMarketOutcome(fullTimeMarket, "HOME")).key,
      ),
      serializeMarketKey(
        successful(createMarketOutcome(fullTimeMarket, "DRAW")).key,
      ),
      serializeMarketKey(
        successful(createMarketOutcome(fullTimeMarket, "AWAY")).key,
      ),
      serializeMarketKey(
        successful(createMarketOutcome(totalMarket, "OVER")).key,
      ),
      serializeMarketKey(
        successful(createMarketOutcome(totalMarket, "UNDER")).key,
      ),
    ]);
  });
});
