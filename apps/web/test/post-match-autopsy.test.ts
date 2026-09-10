import { describe, expect, it } from "vitest";
import type { HistoricalDecisionRow } from "@velyq/database";
import { derivePostMatchAutopsy } from "../app/customer-runtime";

/**
 * Post-Match Autopsy must show the full field set the mandate asks for
 * (mandate section 8): decision odds, fair odds, minimum valid odds, market
 * probability, CLV, result, settlement, reason codes -- all derived from
 * data actually recorded, never generated commentary. The market-implied
 * probability and minimum-acceptable-odds fields are computed here via the
 * same shared, versioned `evaluatePriceValidity` the live verdict uses,
 * applied to the historical modelProbability/offeredOdds this decision
 * actually recorded -- not a margin invented in this module.
 */

function row(
  overrides: Partial<HistoricalDecisionRow> = {},
): HistoricalDecisionRow {
  return {
    decision: {
      id: "decision-1",
      status: "STRONG_EDGE",
      selection: "HOME",
      offeredOdds: "2.2",
      fairOdds: "2",
      whyNotCodes: [],
      createdAt: new Date("2026-09-19T12:00:00.000Z"),
    } as unknown as HistoricalDecisionRow["decision"],
    forecast: {
      probability: "0.5",
    } as unknown as HistoricalDecisionRow["forecast"],
    event: {} as HistoricalDecisionRow["event"],
    competition: {} as HistoricalDecisionRow["competition"],
    marketDefinition: {
      labelKey: "market.football_full_time_1x2",
    } as HistoricalDecisionRow["marketDefinition"],
    outcomeDefinition: {} as HistoricalDecisionRow["outcomeDefinition"],
    settlement: {
      outcome: "WIN",
      closingOdds: "2",
      clv: "0.1",
    } as unknown as HistoricalDecisionRow["settlement"],
    result: {
      homeScore: 2,
      awayScore: 0,
    } as unknown as HistoricalDecisionRow["result"],
    homeTeam: "Home FC",
    awayTeam: "Away FC",
    ...overrides,
  };
}

describe("derivePostMatchAutopsy", () => {
  it("is null with no settled decisions", () => {
    expect(derivePostMatchAutopsy([row({ settlement: null })])).toBeNull();
  });

  it("carries decision timestamp, market-implied probability, and minimum acceptable odds -- all derived from real recorded data", () => {
    const autopsy = derivePostMatchAutopsy([row()]);
    expect(autopsy).not.toBeNull();
    expect(autopsy!.finalScore).toBe("2–0");
    const [decisionRow] = autopsy!.rows;
    expect(decisionRow!.decidedAt).toBe("2026-09-19T12:00:00.000Z");
    expect(decisionRow!.modelProbability).toBe("0.5");
    // Implied probability from offeredOdds "2.2" at decision time: 1/2.2.
    expect(decisionRow!.impliedProbabilityAtDecision).not.toBeNull();
    expect(Number(decisionRow!.impliedProbabilityAtDecision)).toBeCloseTo(
      1 / 2.2,
      6,
    );
    expect(decisionRow!.minimumAcceptableOddsAtDecision).not.toBeNull();
    expect(decisionRow!.priceValidityPolicyVersion).toBe("price-validity.v1");
    expect(decisionRow!.offeredOdds).toBe("2.2");
    expect(decisionRow!.fairOdds).toBe("2");
    expect(decisionRow!.closingOdds).toBe("2");
    expect(decisionRow!.clv).toBe("0.1");
    expect(decisionRow!.outcome).toBe("WIN");
  });

  it("withholds market-implied probability and minimum odds honestly when the price is missing, never fabricating a value", () => {
    const autopsy = derivePostMatchAutopsy([
      row({
        decision: {
          id: "decision-2",
          status: "STRONG_EDGE",
          selection: "HOME",
          offeredOdds: null,
          fairOdds: "2",
          whyNotCodes: [],
          createdAt: new Date("2026-09-19T12:00:00.000Z"),
        } as unknown as HistoricalDecisionRow["decision"],
      }),
    ]);
    const [decisionRow] = autopsy!.rows;
    expect(decisionRow!.impliedProbabilityAtDecision).toBeNull();
    expect(decisionRow!.minimumAcceptableOddsAtDecision).toBeNull();
    // The policy version is still reported -- it's the policy that was
    // consulted, even though it had nothing to compute.
    expect(decisionRow!.priceValidityPolicyVersion).toBe("price-validity.v1");
  });
});
