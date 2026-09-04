import { describe, expect, it } from "vitest";
import {
  DEFAULT_DATA_QUALITY_POLICY,
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

  it("scores source authority and cross-source consistency as quality gates", () => {
    const quality = assessDataQuality({
      ...base,
      sourceAuthority: "UNKNOWN",
      consistency: "CONFLICTING",
    });

    expect(quality.components.sourceAuthority).toBe("0");
    expect(quality.components.consistency).toBe("0");
    expect(quality.score).toBe("0.5");
    expect(quality.reasonCodes).toEqual(
      expect.arrayContaining(["LOW_SOURCE_AUTHORITY", "INCONSISTENT_DATA"]),
    );
  });

  it("uses versioned custom weights and thresholds with exact decimals", () => {
    const policy = {
      ...DEFAULT_DATA_QUALITY_POLICY,
      policyVersion: "quality.custom.v1",
      definition: {
        ...DEFAULT_DATA_QUALITY_POLICY.definition,
        weights: {
          freshness: "0.1",
          priceCoverage: "0.1",
          bookmakerCoverage: "0.1",
          lineupCertainty: "0.1",
          mappingConfidence: "0.1",
          sourceAuthority: "0.1",
          consistency: "0.1",
        },
        thresholds: { gradeA: "0.7", gradeB: "0.6", gradeC: "0.5" },
      },
    } as const;

    expect(
      assessDataQuality(
        { ...base, policyVersion: "quality.custom.v1" },
        policy,
      ),
    ).toMatchObject({
      policyVersion: "quality.custom.v1",
      score: "1",
      grade: "A",
    });
  });

  it("rejects malformed or unordered policy thresholds", () => {
    expect(() =>
      assessDataQuality(
        { ...base, policyVersion: "quality.invalid.v1" },
        {
          ...DEFAULT_DATA_QUALITY_POLICY,
          policyVersion: "quality.invalid.v1",
          definition: {
            ...DEFAULT_DATA_QUALITY_POLICY.definition,
            thresholds: { gradeA: "2", gradeB: "3", gradeC: "1" },
          },
        },
      ),
    ).toThrow("INVALID_QUALITY_POLICY_THRESHOLDS");
  });

  it("rejects invalid policy numeric controls instead of silently falling back", () => {
    expect(() =>
      assessDataQuality(
        { ...base },
        {
          ...DEFAULT_DATA_QUALITY_POLICY,
          definition: {
            ...DEFAULT_DATA_QUALITY_POLICY.definition,
            freshnessSeconds: -1,
          },
        },
      ),
    ).toThrow("INVALID_QUALITY_POLICY_FRESHNESS");

    expect(() =>
      assessDataQuality(
        { ...base },
        {
          ...DEFAULT_DATA_QUALITY_POLICY,
          definition: {
            ...DEFAULT_DATA_QUALITY_POLICY.definition,
            weights: { freshness: "-0.1" },
          },
        },
      ),
    ).toThrow("INVALID_QUALITY_POLICY_freshness_WEIGHT");
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
