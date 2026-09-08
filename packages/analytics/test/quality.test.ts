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
        /*
         * Rounded to the odds storage scale, not the exact quotient. 1 / 0.6
         * has no finite decimal expansion and the unrounded value overflows
         * numeric(18, 8) — asserting it here was asserting a number the
         * database cannot hold, which is why every real price used to fail
         * value computation outright.
         */
        fairOdds: "1.66666667",
        probabilityEdge: "0.1",
        expectedValue: "0.2",
      },
    });
  });
});

/*
 * `EDGE_DISAPPEARED` is a statement about VELYQ's own history — "we published
 * an edge here and it is gone" — not about the current market. It used to be
 * returned whenever no edge was present, so every match the model simply did
 * not like claimed to be a withdrawn recommendation. That is a false claim
 * about the product's own record, and the kind that erodes trust fastest
 * because a customer cannot check it.
 */
describe("EDGE_DISAPPEARED requires an edge to have existed", () => {
  const healthy = {
    policyVersion: "quality.v1" as const,
    asOf: "2026-09-08T12:00:00Z",
    receivedAt: "2026-09-08T12:00:00Z",
    priceCount: 3,
    bookmakerCount: 3,
    lineup: "OFFICIAL" as const,
    mappingConfidence: "HIGH" as const,
    edgeAvailable: true,
    edgePresent: false,
    sourceAuthority: "PRIMARY" as const,
    consistency: "CONSISTENT" as const,
  };

  it("reports NO_BET when no edge was ever published", () => {
    const quality = assessDataQuality(healthy);

    expect(
      decideRecommendation({
        quality,
        lineup: "OFFICIAL",
        edgeAvailable: true,
        edgePresent: false,
      }),
    ).toBe("NO_BET");
  });

  it("reports EDGE_DISAPPEARED only once a prior edge is known", () => {
    const quality = assessDataQuality(healthy);

    expect(
      decideRecommendation({
        quality,
        lineup: "OFFICIAL",
        edgeAvailable: true,
        edgePresent: false,
        hadPriorEdge: true,
      }),
    ).toBe("EDGE_DISAPPEARED");
  });

  it("does not claim a disappearance while an edge is still present", () => {
    const quality = assessDataQuality({ ...healthy, edgePresent: true });

    expect(
      decideRecommendation({
        quality,
        lineup: "OFFICIAL",
        edgeAvailable: true,
        edgePresent: true,
        hadPriorEdge: true,
      }),
    ).not.toBe("EDGE_DISAPPEARED");
  });

  it("lets a hard refusal outrank the lifecycle claim", () => {
    /*
     * Missing prices and stale evidence are reasons the question cannot be
     * answered at all, so they must win over a history-based verdict —
     * otherwise a stale feed would report an edge as having disappeared when
     * nobody knows what the price is.
     */
    const missingPrice = assessDataQuality({
      ...healthy,
      priceCount: 0,
      bookmakerCount: 0,
    });

    expect(
      decideRecommendation({
        quality: missingPrice,
        lineup: "OFFICIAL",
        edgeAvailable: false,
        edgePresent: false,
        hadPriorEdge: true,
      }),
    ).toBe("INSUFFICIENT_DATA");
  });
});
