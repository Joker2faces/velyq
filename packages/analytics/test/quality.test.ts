import { describe, expect, it } from "vitest";
import {
  assessDataQuality,
  calculateValue,
  decideRecommendation,
} from "../src/index.js";

const base = {
  policyVersion: "phase-1-quality.v1",
  asOf: "2026-09-04T10:00:00.000Z",
  receivedAt: "2026-09-04T09:59:00.000Z",
  priceCount: 3,
  bookmakerCount: 2,
  lineup: "OFFICIAL" as const,
  mappingConfidence: "HIGH" as const,
  edgeAvailable: true,
  edgePresent: true,
};
describe("versioned data quality policy", () => {
  it("returns deterministic quality and recommendation refusal", () => {
    const quality = assessDataQuality(base);
    expect(quality.policyVersion).toBe("phase-1-quality.v1");
    expect(quality.grade).toBe("A");
    expect(
      decideRecommendation({
        quality,
        lineup: "OFFICIAL",
        edgeAvailable: true,
        edgePresent: true,
      }),
    ).toBe("NO_BET");
  });

  it("composes quality score with exact decimal arithmetic at thresholds", () => {
    expect(
      assessDataQuality({
        ...base,
        lineup: "EXPECTED",
        mappingConfidence: "LOW",
      }).score,
    ).toBe("0.75");
  });
  it.each([
    ["MISSING", "WAIT_FOR_LINEUP"],
    ["CHANGED", "WAIT_FOR_LINEUP"],
    ["OFFICIAL", "INSUFFICIENT_DATA"],
  ] as const)("refuses %s correctly", (lineup, expected) => {
    const quality = assessDataQuality({
      ...base,
      lineup,
      priceCount: expected === "INSUFFICIENT_DATA" ? 0 : 3,
    });
    expect(
      decideRecommendation({
        quality,
        lineup,
        edgeAvailable: expected !== "INSUFFICIENT_DATA",
        edgePresent: true,
      }),
    ).toBe(expected);
  });
});

describe("exact value engine", () => {
  it("returns exact string metrics without Number arithmetic", () => {
    const result = calculateValue("0.6", "2");
    expect(result).toEqual({
      ok: true,
      value: {
        impliedProbability: "0.5",
        fairOdds: "1.666666666666666666666666666667",
        probabilityEdge: "0.1",
        expectedValue: "0.2",
      },
    });
  });
});
