import { describe, expect, it } from "vitest";
import {
  chronologicalTimeline,
  diffSnapshots,
  edgePersistence,
  eligibleClv,
  selectClosingPrice,
  trackRecord,
} from "../src/index.js";
describe("historical intelligence policy", () => {
  const points = [
    {
      id: "a",
      outcomeId: "home",
      bookmakerId: "a",
      odds: "1.8" as never,
      observedAt: "2026-09-08T17:50:00Z",
      status: "ACTIVE" as const,
    },
    {
      id: "b",
      outcomeId: "home",
      bookmakerId: "b",
      odds: "1.9" as never,
      observedAt: "2026-09-08T17:55:00Z",
      status: "ACTIVE" as const,
    },
    {
      id: "late",
      outcomeId: "home",
      bookmakerId: "c",
      odds: "2.5" as never,
      observedAt: "2026-09-08T18:01:00Z",
      status: "ACTIVE" as const,
    },
  ];
  it("selects pre-kickoff same-outcome median closing consensus", () => {
    expect(
      selectClosingPrice({
        outcomeId: "home",
        kickoff: "2026-09-08T18:00:00Z",
        observations: points,
      }),
    ).toMatchObject({
      odds: "1.85",
      bookmakerCount: 2,
      observationIds: ["a", "b"],
    });
  });
  it("withholds CLV for mismatched or time-invalid prices", () => {
    const closing = selectClosingPrice({
      outcomeId: "home",
      kickoff: "2026-09-08T18:00:00Z",
      observations: points,
    });
    expect(
      eligibleClv({
        decisionOutcomeId: "home",
        closingOutcomeId: "away",
        decisionOdds: "2" as never,
        decisionAt: "2026-09-08T17:00:00Z",
        kickoff: "2026-09-08T18:00:00Z",
        closing,
      }),
    ).toBeNull();
    expect(
      eligibleClv({
        decisionOutcomeId: "home",
        closingOutcomeId: "home",
        decisionOdds: "2" as never,
        decisionAt: "2026-09-08T17:00:00Z",
        kickoff: "2026-09-08T18:00:00Z",
        closing,
      }),
    ).toBe("0.081081081081");
  });
  it("builds factual diffs, ordered timelines and edge persistence", () => {
    const base = {
      at: "2026-09-08T10:00:00Z",
      price: "1.8",
      modelProbability: "0.58",
      lineup: "PENDING",
      quality: "B",
      decision: "WATCH",
      edge: "0",
      market: "1X2",
    };
    expect(
      diffSnapshots(base, {
        ...base,
        at: "2026-09-08T11:00:00Z",
        price: "1.9",
        decision: "EDGE",
      }).map((item) => item.kind),
    ).toEqual(["PRICE_CHANGED", "DECISION_CHANGED"]);
    expect(
      chronologicalTimeline([
        { type: "SETTLED", at: "2026-09-08T20:00:00Z", sourceId: "b" },
        { type: "FORECAST_CREATED", at: "2026-09-08T10:00:00Z", sourceId: "a" },
      ])[0]?.type,
    ).toBe("FORECAST_CREATED");
    expect(
      edgePersistence(
        [
          { at: "2026-09-08T10:00:00Z", active: false },
          { at: "2026-09-08T11:00:00Z", active: true },
        ],
        "2026-09-08T12:00:00Z",
      ),
    ).toMatchObject({
      state: "ACTIVE",
      thresholdCrossings: 1,
      observationCount: 2,
    });
  });
  it("retains losses in aggregate history", () => {
    expect(
      trackRecord([
        { settlement: "WIN", odds: "2", clv: "0.1" },
        { settlement: "LOSS", odds: "1.8", clv: "-0.02" },
        { settlement: "VOID", odds: null, clv: null },
      ]),
    ).toMatchObject({
      sampleSize: 3,
      wins: 1,
      losses: 1,
      voids: 1,
      hitRate: 0.5,
      positiveClvCount: 1,
    });
  });

  it("averages CLV magnitude, not just the count that beat the close", () => {
    const result = trackRecord([
      { settlement: "WIN", odds: "2", clv: "0.1" },
      { settlement: "LOSS", odds: "1.8", clv: "-0.02" },
      { settlement: "VOID", odds: null, clv: null },
    ]);
    expect(result.averageClv).toBeCloseTo(0.04, 10);
  });

  it("reports averageClv as null with no settled CLV to average", () => {
    expect(
      trackRecord([{ settlement: "UNSETTLED", odds: "2", clv: null }])
        .averageClv,
    ).toBeNull();
  });
});
