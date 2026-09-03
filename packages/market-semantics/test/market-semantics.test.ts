import { describe, expect, it } from "vitest";

import { eventId, playerId, teamId } from "@velyq/domain";
import { marketLine } from "@velyq/decimal";

import {
  canonicalMarketDefinitions,
  createEventMarket,
  createMarketOutcome,
  createMarketDefinition,
  serializeMarketKey,
  settleMarket,
} from "../src/index.js";

function successful<T>(result: {
  readonly ok: boolean;
  readonly value?: T;
}): T {
  expect(result.ok).toBe(true);

  if (!result.ok || result.value === undefined) {
    throw new Error("Expected a successful market semantics result");
  }

  return result.value;
}

function footballEvent() {
  return successful(eventId("event-fixture-001"));
}

function line(value: string) {
  return successful(marketLine(value));
}

function outcome(
  definitionCode: keyof typeof canonicalMarketDefinitions,
  outcomeCode: string,
  options: Readonly<{
    readonly line?: ReturnType<typeof line>;
    readonly subject?:
      | Readonly<{
          readonly type: "TEAM";
          readonly id: ReturnType<typeof teamId>;
          readonly role: "HOME_TEAM" | "AWAY_TEAM";
        }>
      | Readonly<{
          readonly type: "PLAYER";
          readonly id: ReturnType<typeof playerId>;
          readonly role: "NAMED_PLAYER";
        }>;
  }> = {},
) {
  const market = successful(
    createEventMarket({
      definition: canonicalMarketDefinitions[definitionCode],
      eventId: footballEvent(),
      ...options,
    }),
  );

  return successful(createMarketOutcome(market, outcomeCode));
}

describe("canonical market keys", () => {
  it("distinguishes full-time 1X2 from first-half 1X2", () => {
    const fullTime = outcome("FOOTBALL_FULL_TIME_1X2", "HOME");
    const firstHalf = outcome("FOOTBALL_FIRST_HALF_1X2", "HOME");

    expect(serializeMarketKey(fullTime.key)).not.toBe(
      serializeMarketKey(firstHalf.key),
    );
  });

  it("distinguishes total 2.5 from Asian total 2.25", () => {
    const total = outcome("FOOTBALL_FULL_TIME_TOTAL", "OVER", {
      line: line("2.5"),
    });
    const asianTotal = outcome("FOOTBALL_FULL_TIME_ASIAN_TOTAL", "OVER", {
      line: line("2.25"),
    });

    expect(serializeMarketKey(total.key)).not.toBe(
      serializeMarketKey(asianTotal.key),
    );
  });

  it("distinguishes event, team, and player subject scopes", () => {
    const eventMarket = outcome("FOOTBALL_FULL_TIME_TOTAL", "OVER", {
      line: line("2.5"),
    });
    const teamMarket = outcome("FOOTBALL_TEAM_TOTAL", "OVER", {
      line: line("1.5"),
      subject: {
        type: "TEAM",
        role: "HOME_TEAM",
        id: successful(teamId("team-fixture-home")),
      },
    });
    const playerMarket = outcome("FOOTBALL_PLAYER_SHOTS", "OVER", {
      line: line("2.5"),
      subject: {
        type: "PLAYER",
        role: "NAMED_PLAYER",
        id: successful(playerId("player-fixture-9")),
      },
    });

    expect(
      new Set([
        serializeMarketKey(eventMarket.key),
        serializeMarketKey(teamMarket.key),
        serializeMarketKey(playerMarket.key),
      ]).size,
    ).toBe(3);
  });
});

describe("market-definition validation", () => {
  it("rejects a required line that is absent", () => {
    const result = createEventMarket({
      definition: canonicalMarketDefinitions.FOOTBALL_FULL_TIME_TOTAL,
      eventId: footballEvent(),
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "LINE_REQUIRED" },
    });
  });

  it("rejects a forbidden line", () => {
    const result = createEventMarket({
      definition: canonicalMarketDefinitions.FOOTBALL_FULL_TIME_1X2,
      eventId: footballEvent(),
      line: line("2.5"),
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "LINE_FORBIDDEN" },
    });
  });

  it("rejects a line that is not on the allowed increment", () => {
    const result = createEventMarket({
      definition: canonicalMarketDefinitions.FOOTBALL_FULL_TIME_TOTAL,
      eventId: footballEvent(),
      line: line("2.25"),
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "UNSUPPORTED_LINE_INCREMENT" },
    });
  });

  it("rejects a subject that does not match the definition scope", () => {
    const result = createEventMarket({
      definition: canonicalMarketDefinitions.FOOTBALL_TEAM_TOTAL,
      eventId: footballEvent(),
      line: line("1.5"),
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "SUBJECT_MISMATCH" },
    });
  });

  it("rejects definitions whose outcomes do not match their structure", () => {
    const result = createMarketDefinition({
      code: "BROKEN_TWO_WAY",
      sportCode: "FOOTBALL",
      familyCode: "TOTAL",
      periodCode: "FULL_TIME",
      structure: "TWO_WAY",
      subjectType: "EVENT",
      linePolicy: "REQUIRED",
      allowedLineIncrement: "HALF",
      outcomeCodes: ["OVER", "UNDER", "DRAW"],
      settlementRuleVersion: "FUTURE_RULE_V1",
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "INVALID_DEFINITION" },
    });
  });

  it("rejects outcome codes outside the canonical outcome set", () => {
    const result = createMarketDefinition({
      code: "UNKNOWN_OUTCOME_CODES",
      sportCode: "FOOTBALL",
      familyCode: "TOTAL",
      periodCode: "FULL_TIME",
      structure: "TWO_WAY",
      subjectType: "EVENT",
      linePolicy: "REQUIRED",
      allowedLineIncrement: "HALF",
      outcomeCodes: ["ALPHA", "BETA"],
      settlementRuleVersion: "FUTURE_RULE_V1",
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "INVALID_DEFINITION" },
    });
  });
});

describe("settlement registry", () => {
  it.each([
    ["HOME", { homeScore: 2, awayScore: 1 }, "WIN"],
    ["DRAW", { homeScore: 2, awayScore: 1 }, "LOSS"],
    ["AWAY", { homeScore: 1, awayScore: 1 }, "LOSS"],
  ] as const)(
    "settles full-time 1X2 %s selections",
    (selection, score, status) => {
      const result = settleMarket(
        outcome("FOOTBALL_FULL_TIME_1X2", selection),
        { status: "FINAL", ...score },
      );

      expect(result).toMatchObject({ kind: "SETTLED", status });
    },
  );

  it.each([
    ["OVER", { homeScore: 2, awayScore: 1 }, "WIN"],
    ["UNDER", { homeScore: 2, awayScore: 1 }, "LOSS"],
    ["UNDER", { homeScore: 1, awayScore: 1 }, "WIN"],
  ] as const)(
    "settles full-time O/U 2.5 %s selections",
    (selection, score, status) => {
      const result = settleMarket(
        outcome("FOOTBALL_FULL_TIME_TOTAL", selection, { line: line("2.5") }),
        { status: "FINAL", ...score },
      );

      expect(result).toMatchObject({ kind: "SETTLED", status });
    },
  );

  it("voids executable rules for abandoned events", () => {
    const result = settleMarket(outcome("FOOTBALL_FULL_TIME_1X2", "HOME"), {
      status: "ABANDONED",
    });

    expect(result).toMatchObject({ kind: "SETTLED", status: "VOID" });
  });

  it("leaves non-final events unsettled", () => {
    const result = settleMarket(outcome("FOOTBALL_FULL_TIME_1X2", "HOME"), {
      status: "IN_PROGRESS",
    });

    expect(result).toMatchObject({ kind: "SETTLED", status: "UNSETTLED" });
  });

  it("returns a typed unsupported result for a future canonical market", () => {
    const result = settleMarket(
      outcome("FOOTBALL_FULL_TIME_ASIAN_TOTAL", "OVER", { line: line("2.25") }),
      { status: "FINAL", homeScore: 2, awayScore: 1 },
    );

    expect(result).toMatchObject({
      kind: "UNSUPPORTED",
      error: { code: "UNSUPPORTED_SETTLEMENT" },
    });
  });

  it("does not void a first-half market forged with the full-time 1X2 version", () => {
    const firstHalf = outcome("FOOTBALL_FIRST_HALF_1X2", "HOME");
    const forged = {
      ...firstHalf,
      key: {
        ...firstHalf.key,
        settlementRuleVersion: "FOOTBALL_1X2_FULL_TIME_V1",
      },
    };

    expect(settleMarket(forged, { status: "ABANDONED" })).toMatchObject({
      kind: "UNSUPPORTED",
      error: { code: "UNSUPPORTED_SETTLEMENT" },
    });
  });

  it("does not leave full-time O/U 3.5 unsettled under the O/U 2.5 version", () => {
    const total = outcome("FOOTBALL_FULL_TIME_TOTAL", "OVER", {
      line: line("3.5"),
    });

    expect(settleMarket(total, { status: "IN_PROGRESS" })).toMatchObject({
      kind: "UNSUPPORTED",
      error: { code: "UNSUPPORTED_SETTLEMENT" },
    });
  });
});

describe("future canonical identities", () => {
  it.each([
    ["FOOTBALL_FULL_TIME_ASIAN_TOTAL", "OVER", "2.25", undefined],
    ["FOOTBALL_FULL_TIME_ASIAN_HANDICAP", "HOME", "-0.25", undefined],
    ["FOOTBALL_PLAYER_SHOTS", "OVER", "2.5", "PLAYER"],
    ["FOOTBALL_PLAYER_SHOTS_ON_TARGET", "OVER", "1.5", "PLAYER"],
    ["FOOTBALL_GOALKEEPER_SAVES", "OVER", "3.5", "PLAYER"],
    ["FOOTBALL_ANYTIME_GOALSCORER", "YES", undefined, "PLAYER"],
    ["FOOTBALL_PLAYER_CARD", "YES", undefined, "PLAYER"],
    ["FOOTBALL_CORNERS_HANDICAP", "HOME", "-0.25", undefined],
  ] as const)(
    "validates %s without enabling settlement",
    (definitionCode, outcomeCode, lineValue, subjectType) => {
      const subject =
        subjectType === "PLAYER"
          ? {
              type: "PLAYER" as const,
              role: "NAMED_PLAYER" as const,
              id: successful(playerId("player-fixture-10")),
            }
          : undefined;
      const market = outcome(definitionCode, outcomeCode, {
        ...(lineValue === undefined ? {} : { line: line(lineValue) }),
        ...(subject === undefined ? {} : { subject }),
      });

      expect(serializeMarketKey(market.key)).toContain(
        `family=${market.key.familyCode}`,
      );
      expect(
        settleMarket(market, { status: "FINAL", homeScore: 1, awayScore: 0 }),
      ).toMatchObject({ kind: "UNSUPPORTED" });
    },
  );
});
