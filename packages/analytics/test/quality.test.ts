import { describe, expect, it } from "vitest";
import { assessDataQuality, decideRecommendation } from "../src/index.js";

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
