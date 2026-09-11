import { describe, expect, it } from "vitest";
import {
  LIVE_DATA_LABEL,
  SYNTHETIC_DATA_LABEL,
  type CustomerMatchDto,
} from "@velyq/contracts";
import { customerTodaySnapshot } from "../app/customer-data";
import { selectVelyqOne } from "../app/today/velyq-one";

const AS_OF = "2026-09-20T12:00:00.000Z";
const base = customerTodaySnapshot().matches[0]!;

function candidate(overrides: Record<string, unknown> = {}): CustomerMatchDto {
  return {
    ...base,
    eventId: "event-a",
    startsAt: "2026-09-20T18:00:00.000Z",
    syntheticLabel: LIVE_DATA_LABEL,
    recommendation: "STRONG_EDGE",
    freshness: "CURRENT",
    lineup: "OFFICIAL",
    modelProbability: "0.6",
    currentOdds: "1.85",
    impliedProbability: "0.540540540541",
    probabilityEdge: "0.059459459459",
    expectedValue: "0.11",
    priceValidity: {
      status: "ATTRACTIVE",
      policyVersion: "price-validity.v1",
      breakEvenOdds: "1.66666667",
      minimumAcceptableOdds: "1.7",
    },
    quality: {
      grade: "A",
      score: "1",
      policyVersion: "quality-policy.v1",
      reasonCodes: [],
    },
    ...overrides,
  } as unknown as CustomerMatchDto;
}

describe("selectVelyqOne", () => {
  it("never promotes a non-actionable recommendation", () => {
    const enormousValue = candidate({
      recommendation: "NO_BET",
      modelProbability: "0.9",
      currentOdds: "3",
      probabilityEdge: "0.566666666667",
      expectedValue: "1.7",
    });

    expect(selectVelyqOne([enormousValue], AS_OF)).toBeNull();
  });

  it.each([
    ["synthetic evidence", { syntheticLabel: SYNTHETIC_DATA_LABEL }],
    ["an aging price", { freshness: "AGING" }],
    ["an expected lineup", { lineup: "EXPECTED" }],
    ["low-quality evidence", { quality: { ...base.quality, grade: "C" } }],
    ["a started fixture", { startsAt: AS_OF }],
    ["a later UTC day", { startsAt: "2026-09-21T00:01:00.000Z" }],
    [
      "a marginal price",
      { priceValidity: { ...base.priceValidity, status: "MARGINAL" } },
    ],
  ] as const)("rejects %s", (_name, overrides) => {
    expect(selectVelyqOne([candidate(overrides)], AS_OF)).toBeNull();
  });

  it("rechecks the current price against the decision edge threshold", () => {
    const staleDecision = candidate({
      currentOdds: "1.72",
      impliedProbability: "0.581395348837",
      probabilityEdge: "0.018604651163",
      expectedValue: "0.032",
    });

    expect(staleDecision.priceValidity.status).toBe("ATTRACTIVE");
    expect(selectVelyqOne([staleDecision], AS_OF)).toBeNull();
  });

  it("ranks eligible selections by current edge independent of input order", () => {
    const smallerEdge = candidate({
      eventId: "event-smaller-edge",
      modelProbability: "0.55",
      currentOdds: "1.95",
      probabilityEdge: "0.037179487179",
      expectedValue: "0.0725",
    });
    const largerEdge = candidate({
      eventId: "event-z",
      modelProbability: "0.6",
      currentOdds: "1.85",
      probabilityEdge: "0.059459459459",
      expectedValue: "0.11",
      quality: { ...base.quality, grade: "B", score: "0.75" },
    });
    expect(
      selectVelyqOne([smallerEdge, largerEdge], AS_OF)?.match.eventId,
    ).toBe("event-z");
    expect(
      selectVelyqOne([largerEdge, smallerEdge], AS_OF)?.match.eventId,
    ).toBe("event-z");
  });

  it("uses current EV when current probability edges are exactly tied", () => {
    const lowerEv = candidate({
      eventId: "event-lower-ev",
      modelProbability: "0.6",
      currentOdds: "2",
    });
    const higherEv = candidate({
      eventId: "event-higher-ev",
      modelProbability: "0.5",
      currentOdds: "2.5",
    });

    expect(selectVelyqOne([lowerEv, higherEv], AS_OF)?.match.eventId).toBe(
      "event-higher-ev",
    );
    expect(selectVelyqOne([higherEv, lowerEv], AS_OF)?.match.eventId).toBe(
      "event-higher-ev",
    );
  });

  it("uses quality, kickoff, event and selection as stable tie-breakers", () => {
    const shared = { modelProbability: "0.6", currentOdds: "2" };
    const gradeA = candidate({
      ...shared,
      eventId: "grade-a",
      quality: { ...base.quality, grade: "A" },
    });
    const gradeB = candidate({
      ...shared,
      eventId: "grade-b",
      quality: { ...base.quality, grade: "B" },
    });
    expect(selectVelyqOne([gradeB, gradeA], AS_OF)?.match.eventId).toBe(
      "grade-a",
    );

    const early = candidate({
      ...shared,
      eventId: "later-id",
      startsAt: "2026-09-20T17:00:00.000Z",
    });
    const late = candidate({
      ...shared,
      eventId: "earlier-id",
      startsAt: "2026-09-20T19:00:00.000Z",
    });
    expect(selectVelyqOne([late, early], AS_OF)?.match.eventId).toBe(
      "later-id",
    );

    const eventA = candidate({ ...shared, eventId: "event-a" });
    const eventB = candidate({ ...shared, eventId: "event-b" });
    expect(selectVelyqOne([eventB, eventA], AS_OF)?.match.eventId).toBe(
      "event-a",
    );

    const away = candidate({
      ...shared,
      eventId: "same-event",
      selection: "AWAY",
    });
    const home = candidate({
      ...shared,
      eventId: "same-event",
      selection: "HOME",
    });
    expect(selectVelyqOne([home, away], AS_OF)?.match.selection).toBe("AWAY");
  });

  it("returns current metrics recalculated from the displayed model and price", () => {
    const selected = selectVelyqOne([candidate()], AS_OF);

    expect(selected?.metrics).toEqual({
      impliedProbability: "0.540540540541",
      fairOdds: "1.66666667",
      probabilityEdge: "0.059459459459",
      expectedValue: "0.11",
    });
  });
});
