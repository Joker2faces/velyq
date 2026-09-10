import { describe, expect, it } from "vitest";
import type { CustomerRawMatch, CustomerRawOutcome } from "@velyq/database";
import { mapMatch } from "../app/customer-database";

/**
 * Market Consensus / Market Map / Risk Flags, wired end to end through
 * `mapMatch`: the same real per-bookmaker odds rows the headline card
 * already reads, regrouped across a market's outcomes into one coherent
 * de-vigged snapshot -- never fabricated, never mixing bookmakers observed
 * at different provider instants.
 */

const ASOF = new Date("2026-09-20T12:00:00.000Z");
const T1 = new Date("2026-09-20T11:30:00.000Z");
const T2 = new Date("2026-09-20T11:45:00.000Z");

function oneXTwoOutcome(
  outcomeCode: "HOME" | "DRAW" | "AWAY",
  quotes: readonly {
    bookmakerId: string;
    decimalOdds: string;
    providerObservedAt?: Date;
  }[],
): CustomerRawOutcome {
  return {
    market: { lineValue: null } as CustomerRawOutcome["market"],
    marketDefinition: {
      code: "FOOTBALL_FULL_TIME_1X2",
      labelKey: "market.football_full_time_1x2",
    } as CustomerRawOutcome["marketDefinition"],
    outcome: {} as CustomerRawOutcome["outcome"],
    outcomeDefinition: {
      code: outcomeCode,
    } as CustomerRawOutcome["outcomeDefinition"],
    prediction: {
      prediction: {
        modelProbability: "0.5",
        fairOdds: "2",
        marketImpliedProbability: "0.5",
        edge: "0",
        expectedValue: "0",
        decisionStatus: "WAIT",
        marketPriceObservationId: null,
      },
      run: {
        id: "run-1",
        modelVersionId: "model-1",
        calibrationVersionId: "calibration-1",
        featureCutoff: ASOF,
      },
    } as unknown as CustomerRawOutcome["prediction"],
    predictionInputs: [],
    quality: {
      grade: "B",
      numericScore: "0.8",
      policyVersionId: "quality-policy-1",
      reasonCodes: [],
      id: "quality-1",
    } as unknown as CustomerRawOutcome["quality"],
    score: null,
    odds: quotes.map((quote) => ({
      decimalOdds: quote.decimalOdds,
      providerObservedAt: quote.providerObservedAt ?? T1,
      isSynthetic: false,
      bookmakerId: quote.bookmakerId,
    })) as unknown as CustomerRawOutcome["odds"],
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

describe("mapMatch market consensus and risk flags", () => {
  it("builds a real de-vig consensus from complete bookmaker books", () => {
    const raw = match([
      oneXTwoOutcome("HOME", [
        { bookmakerId: "book-a", decimalOdds: "2" },
        { bookmakerId: "book-b", decimalOdds: "2.05" },
      ]),
      oneXTwoOutcome("DRAW", [
        { bookmakerId: "book-a", decimalOdds: "3.4" },
        { bookmakerId: "book-b", decimalOdds: "3.3" },
      ]),
      oneXTwoOutcome("AWAY", [
        { bookmakerId: "book-a", decimalOdds: "3.8" },
        { bookmakerId: "book-b", decimalOdds: "3.7" },
      ]),
    ]);

    const dto = mapMatch(raw);

    expect(dto.marketConsensus).toBeDefined();
    expect(dto.marketConsensus!.bookmakerCount).toBe(2);
    expect(dto.marketConsensus!.completeBookmakerCount).toBe(2);
    const home = dto.marketConsensus!.outcomes.find(
      (o) => o.outcomeCode === "HOME",
    )!;
    expect(home.bestOdds).toBe("2.05");
    expect(home.consensusProbability).not.toBeNull();
  });

  it("never mixes a stale bookmaker instant into the current snapshot", () => {
    const raw = match([
      oneXTwoOutcome("HOME", [
        { bookmakerId: "book-a", decimalOdds: "2", providerObservedAt: T1 },
        { bookmakerId: "book-b", decimalOdds: "9", providerObservedAt: T2 },
      ]),
      oneXTwoOutcome("DRAW", [
        { bookmakerId: "book-a", decimalOdds: "3.4", providerObservedAt: T1 },
      ]),
      oneXTwoOutcome("AWAY", [
        { bookmakerId: "book-a", decimalOdds: "3.8", providerObservedAt: T1 },
      ]),
    ]);

    const dto = mapMatch(raw);

    // Latest instant is T2, where only book-b quoted HOME (incomplete book):
    // book-a's earlier DRAW/AWAY prices must never be borrowed to complete it.
    expect(dto.marketConsensus!.observedAt).toBe(T2.toISOString());
    expect(dto.marketConsensus!.completeBookmakerCount).toBe(0);
    expect(
      dto.marketConsensus!.outcomes.find((o) => o.outcomeCode === "HOME")!
        .bestOdds,
    ).toBe("9");
  });

  it("is undefined, not a zeroed object, when nobody has quoted the market", () => {
    const raw = match([
      oneXTwoOutcome("HOME", []),
      oneXTwoOutcome("DRAW", []),
      oneXTwoOutcome("AWAY", []),
    ]);
    const dto = mapMatch(raw);
    expect(dto.marketConsensus).toBeUndefined();
  });

  it("flags MARKET_CONSENSUS_UNAVAILABLE when no book is complete", () => {
    const raw = match([
      oneXTwoOutcome("HOME", [{ bookmakerId: "book-a", decimalOdds: "2" }]),
      oneXTwoOutcome("DRAW", []),
      oneXTwoOutcome("AWAY", []),
    ]);
    const dto = mapMatch(raw);
    expect(dto.riskFlags).toContain("MARKET_CONSENSUS_UNAVAILABLE");
  });

  it("flags LOW_MARKET_COVERAGE below the minimum bookmaker threshold", () => {
    const raw = match([
      oneXTwoOutcome("HOME", [{ bookmakerId: "book-a", decimalOdds: "2" }]),
      oneXTwoOutcome("DRAW", [{ bookmakerId: "book-a", decimalOdds: "3.4" }]),
      oneXTwoOutcome("AWAY", [{ bookmakerId: "book-a", decimalOdds: "3.8" }]),
    ]);
    const dto = mapMatch(raw);
    expect(dto.riskFlags).toContain("LOW_MARKET_COVERAGE");
  });

  it("always includes MODEL_EXPERIMENTAL, the model's own honest maturity claim", () => {
    const raw = match([
      oneXTwoOutcome("HOME", []),
      oneXTwoOutcome("DRAW", []),
      oneXTwoOutcome("AWAY", []),
    ]);
    const dto = mapMatch(raw);
    expect(dto.riskFlags).toContain("MODEL_EXPERIMENTAL");
  });

  it("flags OUTLIER_PRICE when the selected outcome's own price is an outlier among enough peers", () => {
    const raw = match([
      oneXTwoOutcome("HOME", [
        { bookmakerId: "book-a", decimalOdds: "2" },
        { bookmakerId: "book-b", decimalOdds: "2.05" },
        { bookmakerId: "book-c", decimalOdds: "1.95" },
        { bookmakerId: "book-d", decimalOdds: "2.02" },
        // Wildly off the other four -- and this outcome is the customer's
        // own selection, per selectOutcome's first-outcome default.
        { bookmakerId: "book-e", decimalOdds: "5" },
      ]),
      oneXTwoOutcome("DRAW", [{ bookmakerId: "book-a", decimalOdds: "3.4" }]),
      oneXTwoOutcome("AWAY", [{ bookmakerId: "book-a", decimalOdds: "3.8" }]),
    ]);
    const dto = mapMatch(raw);
    expect(dto.selection).toBe("HOME");
    expect(dto.riskFlags).toContain("OUTLIER_PRICE");
  });
});
