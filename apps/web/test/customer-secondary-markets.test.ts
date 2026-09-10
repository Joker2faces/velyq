import { describe, expect, it } from "vitest";
import type { CustomerRawMatch, CustomerRawOutcome } from "@velyq/database";
import { mapMatch, secondaryMarketsFor } from "../app/customer-database";

/**
 * The FT Over/Under 2.5 pipeline now produces real predictions and
 * decisions (see packages/application/src/forecast-cycle.ts), but nothing
 * customer-facing read them until `secondaryMarkets` was added to the
 * match DTO. This proves `mapMatch` actually surfaces a real totals
 * decision, through the same primitives the match-result headline uses --
 * not a placeholder, not fabricated, and never confused with the headline
 * market.
 */

const ASOF = new Date("2026-09-20T12:00:00.000Z");
const OBSERVED_AT = new Date("2026-09-20T11:30:00.000Z");

function outcome(
  overrides: Partial<{
    marketCode: string;
    marketLabelKey: string;
    lineValue: string | null;
    outcomeCode: string;
    decisionStatus: string;
    modelProbability: string | null;
    currentOdds: string | null;
    fairOdds: string | null;
    edge: string | null;
    expectedValue: string | null;
    hasOdds: boolean;
    bookmakerIds: string[];
  }> = {},
): CustomerRawOutcome {
  const hasOdds = overrides.hasOdds ?? true;
  const hasPrediction = overrides.modelProbability !== null;
  return {
    market: {
      lineValue: overrides.lineValue ?? null,
    } as CustomerRawOutcome["market"],
    marketDefinition: {
      code: overrides.marketCode ?? "FOOTBALL_FULL_TIME_1X2",
      labelKey:
        overrides.marketLabelKey ??
        `market.${(overrides.marketCode ?? "FOOTBALL_FULL_TIME_1X2").toLowerCase()}`,
    } as CustomerRawOutcome["marketDefinition"],
    outcome: {} as CustomerRawOutcome["outcome"],
    outcomeDefinition: {
      code: overrides.outcomeCode ?? "HOME",
    } as CustomerRawOutcome["outcomeDefinition"],
    prediction: hasPrediction
      ? ({
          prediction: {
            modelProbability: overrides.modelProbability ?? "0.55",
            fairOdds: overrides.fairOdds ?? "1.818181818181818182",
            marketImpliedProbability: "0.5",
            edge: overrides.edge ?? "0.05",
            expectedValue: overrides.expectedValue ?? "0.07",
            decisionStatus: overrides.decisionStatus ?? "WAIT",
            marketPriceObservationId: null,
          },
          run: {
            id: "run-1",
            modelVersionId: "model-1",
            calibrationVersionId: "calibration-1",
            featureCutoff: ASOF,
          },
        } as CustomerRawOutcome["prediction"])
      : null,
    predictionInputs: [],
    quality: {
      grade: "B",
      numericScore: "0.8",
      policyVersionId: "quality-policy-1",
      reasonCodes: [],
      id: "quality-1",
    } as unknown as CustomerRawOutcome["quality"],
    score: null,
    odds: hasOdds
      ? (overrides.bookmakerIds ?? [undefined]).map((bookmakerId) => ({
          decimalOdds: overrides.currentOdds ?? "1.95",
          providerObservedAt: OBSERVED_AT,
          isSynthetic: false,
          bookmakerId,
        })) as unknown as CustomerRawOutcome["odds"]
      : [],
  };
}

function match(outcomes: readonly CustomerRawOutcome[]): CustomerRawMatch {
  return {
    event: { id: "event-1", startsAt: ASOF } as CustomerRawMatch["event"],
    sport: {} as CustomerRawMatch["sport"],
    competition: {
      nameKey: "competition.test",
    } as CustomerRawMatch["competition"],
    participants: [
      {
        participant: { displayName: "Home FC" },
        eventParticipant: { role: "HOME" },
      },
      {
        participant: { displayName: "Away FC" },
        eventParticipant: { role: "AWAY" },
      },
    ] as unknown as CustomerRawMatch["participants"],
    lineups: [],
    outcomes,
    asOf: ASOF,
  };
}

describe("secondaryMarketsFor", () => {
  it("is empty for a fixture with only the match-result market", () => {
    const raw = match([outcome({ marketCode: "FOOTBALL_FULL_TIME_1X2" })]);
    expect(secondaryMarketsFor(raw)).toEqual([]);
  });

  it("surfaces a real totals decision, distinct from the headline market", () => {
    const raw = match([
      outcome({ marketCode: "FOOTBALL_FULL_TIME_1X2", outcomeCode: "HOME" }),
      outcome({
        marketCode: "FOOTBALL_FULL_TIME_TOTAL",
        lineValue: "2.5",
        outcomeCode: "OVER",
        decisionStatus: "STRONG_EDGE",
        modelProbability: "0.6",
        currentOdds: "1.85",
        fairOdds: "1.666666666666666667",
        edge: "0.1",
        expectedValue: "0.11",
      }),
    ]);
    const secondary = secondaryMarketsFor(raw);
    expect(secondary).toHaveLength(1);
    expect(secondary[0]).toMatchObject({
      marketCode: "FOOTBALL_FULL_TIME_TOTAL",
      lineValue: "2.5",
      selection: "OVER",
      recommendation: "STRONG_EDGE",
      currentOdds: "1.85",
    });
    expect(secondary[0]!.modelProbability).not.toBeNull();
    expect(Number(secondary[0]!.modelProbability)).toBeCloseTo(0.6, 6);
  });

  it("carries both sides of a two-way market independently", () => {
    const raw = match([
      outcome({ marketCode: "FOOTBALL_FULL_TIME_1X2" }),
      outcome({
        marketCode: "FOOTBALL_FULL_TIME_TOTAL",
        lineValue: "2.5",
        outcomeCode: "OVER",
        decisionStatus: "NO_BET",
      }),
      outcome({
        marketCode: "FOOTBALL_FULL_TIME_TOTAL",
        lineValue: "2.5",
        outcomeCode: "UNDER",
        decisionStatus: "WAIT",
      }),
    ]);
    const secondary = secondaryMarketsFor(raw);
    expect(secondary.map((row) => row.selection).sort()).toEqual([
      "OVER",
      "UNDER",
    ]);
    expect(
      secondary.find((row) => row.selection === "OVER")?.recommendation,
    ).toBe("NO_BET");
    expect(
      secondary.find((row) => row.selection === "UNDER")?.recommendation,
    ).toBe("WAIT");
  });

  /*
   * A refused decision (no odds yet, or the model has not evaluated it) must
   * still appear -- honestly, as a refusal -- rather than being hidden. VELYQ
   * is not a tipster: a WAIT/NO_BET row is not a defect to suppress.
   */
  it("reports a refusal state with null metrics rather than hiding the row", () => {
    const raw = match([
      outcome({ marketCode: "FOOTBALL_FULL_TIME_1X2" }),
      outcome({
        marketCode: "FOOTBALL_FULL_TIME_TOTAL",
        outcomeCode: "OVER",
        modelProbability: null,
        hasOdds: false,
      }),
    ]);
    const secondary = secondaryMarketsFor(raw);
    expect(secondary).toHaveLength(1);
    expect(secondary[0]!.recommendation).toBe("INSUFFICIENT_DATA");
    expect(secondary[0]!.modelProbability).toBeNull();
    expect(secondary[0]!.currentOdds).toBeNull();
  });

  it("never leaks into the headline mapMatch fields", () => {
    const raw = match([
      outcome({
        marketCode: "FOOTBALL_FULL_TIME_1X2",
        outcomeCode: "HOME",
        decisionStatus: "WAIT",
        currentOdds: "2.10",
      }),
      outcome({
        marketCode: "FOOTBALL_FULL_TIME_TOTAL",
        outcomeCode: "OVER",
        decisionStatus: "STRONG_EDGE",
        currentOdds: "1.50",
      }),
    ]);
    const dto = mapMatch(raw);
    // The headline card is still the match-result outcome, unaffected by a
    // stronger totals decision sitting alongside it.
    expect(dto.selection).toBe("HOME");
    expect(dto.recommendation).toBe("WAIT");
    expect(dto.currentOdds).toBe("2.1");
    expect(dto.secondaryMarkets).toHaveLength(1);
    expect(dto.secondaryMarkets![0]!.selection).toBe("OVER");
  });

  it("carries the headline's bookmaker count onto the DTO", () => {
    const raw = match([
      outcome({
        marketCode: "FOOTBALL_FULL_TIME_1X2",
        outcomeCode: "HOME",
        bookmakerIds: ["book-a", "book-b", "book-c"],
      }),
    ]);
    const dto = mapMatch(raw);
    expect(dto.bookmakerCount).toBe(3);
  });

  it("omits bookmakerCount rather than reporting zero when identity is unknown", () => {
    const raw = match([
      outcome({ marketCode: "FOOTBALL_FULL_TIME_1X2", outcomeCode: "HOME" }),
    ]);
    const dto = mapMatch(raw);
    expect(dto.bookmakerCount).toBeUndefined();
  });
});
