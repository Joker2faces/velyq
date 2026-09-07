import { describe, expect, it } from "vitest";

import {
  analyzeScenario,
  buildDecisionTimeline,
  createDecisionExplanation,
  createPostMatchAutopsy,
  evaluateModelAudit,
  validateBacktestRecord,
  validateModelProvenance,
} from "../src/index.js";

const quality = {
  policyVersion: "quality.v1" as const,
  grade: "HIGH" as const,
  score: 100,
  reasonCodes: [],
  riskFlags: [],
  invalidationConditions: [],
};

describe("scenario lab", () => {
  it("reports EV sensitivity, threshold crossing, and only supplied quality changes", () => {
    // Break caught: treating a worse price as an unchanged opportunity hides an actionable threshold crossing.
    const scenario = analyzeScenario({
      baseline: {
        modelProbability: "0.6",
        odds: "1.85",
        quality,
      },
      changed: {
        modelProbability: "0.6",
        odds: "1.6",
        quality: { ...quality, grade: "MEDIUM", score: 70 },
      },
    });

    expect(scenario).toMatchObject({
      expectedValueSensitivity: "-0.15",
      priceThresholdCrossed: true,
      qualityChanges: ["GRADE_CHANGED", "SCORE_CHANGED"],
      baseline: { status: "ATTRACTIVE" },
      changed: { status: "UNATTRACTIVE" },
    });
    expect(scenario.modelProbabilityChanged).toBe(false);
    expect(Object.isFrozen(scenario)).toBe(true);
  });
});

describe("structured decision explanation and timeline", () => {
  it.each([
    ["NO_BET", "PRICE_THRESHOLD"],
    ["WAIT", "STALE_DATA"],
    ["WAIT_FOR_LINEUP", "LINEUP"],
    ["INSUFFICIENT_DATA", "DATA_MISMATCH"],
    ["EDGE_DISAPPEARED", "PRICE_THRESHOLD"],
  ] as const)(
    "explains %s with machine-readable invalidation conditions",
    (state, kind) => {
      // Break caught: a prose-only reason cannot drive an auditable decision workflow.
      const explanation = createDecisionExplanation({
        state,
        reasonCodes: ["SOURCE_REASON"],
        priceThreshold: "1.7",
        observedOdds: "1.65",
        lineup: "MISSING",
        freshness: "STALE",
        qualityDowngraded: true,
        dataMismatch: true,
      });

      expect(explanation).toMatchObject({
        policyVersion: "decision.v1",
        state,
        reasonCodes: ["SOURCE_REASON"],
        riskPolicyVersion: "quality.v1",
      });
      expect(explanation.invalidationConditions).toEqual(
        expect.arrayContaining([expect.objectContaining({ kind })]),
      );
    },
  );

  it("orders only supplied decision events by instant and keeps their evidence references", () => {
    // Break caught: input-order timelines or fabricated events make an audit trail misleading.
    const timeline = buildDecisionTimeline([
      {
        type: "EDGE_CONFIRMED",
        occurredAt: "2026-09-06T10:02:00.000Z",
        evidenceIds: ["confirm-1"],
      },
      {
        type: "PRICE_MOVED",
        occurredAt: "2026-09-06T10:01:00.000Z",
        evidenceIds: ["price-1"],
      },
    ]);

    expect(timeline).toEqual([
      expect.objectContaining({
        type: "PRICE_MOVED",
        evidenceIds: ["price-1"],
      }),
      expect.objectContaining({
        type: "EDGE_CONFIRMED",
        evidenceIds: ["confirm-1"],
      }),
    ]);
    expect(Object.isFrozen(timeline)).toBe(true);
  });
});

describe("post-match autopsy", () => {
  it("keeps decision quality and outcome separate when closing price is unavailable", () => {
    // Break caught: inferring a closing price or treating an outcome as a quality grade manufactures performance evidence.
    const autopsy = createPostMatchAutopsy({
      decisionId: "decision-1",
      quality,
      outcome: { status: "LOSS", resultReference: "result-1" },
      closingOdds: null,
    });

    expect(autopsy).toEqual({
      decisionId: "decision-1",
      decisionQuality: quality,
      eventOutcome: { status: "LOSS", resultReference: "result-1" },
      closingLine: { status: "UNAVAILABLE", odds: null },
    });
    expect(Object.isFrozen(autopsy)).toBe(true);
  });
});

describe("model audit and calibration", () => {
  it("calculates deterministic Brier, log loss, bins, coverage, and baseline comparison", () => {
    // Break caught: combining outcomes with the wrong forecasts changes calibration and creates false performance claims.
    const audit = evaluateModelAudit({
      records: [
        { probability: "0.8", outcome: 1 },
        { probability: "0.4", outcome: 0 },
      ],
      baselineProbability: "0.5",
      binCount: 10,
    });

    expect(audit).toMatchObject({
      ok: true,
      value: {
        brierScore: "0.1",
        coverage: { evaluated: 2, total: 2 },
        baselineComparison: { brierScore: "0.25", brierImprovement: "0.15" },
      },
    });
    if (audit.ok) {
      expect(audit.value.logLoss).toBeCloseTo(0.3669845875, 10);
      expect(audit.value.calibration).toEqual([
        expect.objectContaining({
          range: "[0.4,0.5)",
          count: 1,
          observedRate: "0",
        }),
        expect.objectContaining({
          range: "[0.8,0.9)",
          count: 1,
          observedRate: "1",
        }),
      ]);
    }
  });

  it("rejects invalid probabilities and outcomes instead of omitting them", () => {
    // Break caught: silently dropping malformed observations inflates reported coverage.
    expect(
      evaluateModelAudit({
        records: [{ probability: "1.1", outcome: 2 }],
        baselineProbability: null,
        binCount: 10,
      }),
    ).toMatchObject({ ok: false, error: { code: "INVALID_AUDIT_RECORD" } });
  });

  it("rejects probability boundaries that make log loss non-finite", () => {
    // Break caught: accepting a zero or one forecast can yield an infinite metric instead of a usable audit.
    expect(
      evaluateModelAudit({
        records: [{ probability: "1", outcome: 0 }],
        baselineProbability: null,
        binCount: 10,
      }),
    ).toMatchObject({ ok: false, error: { code: "INVALID_AUDIT_RECORD" } });
  });
});

const provenance = {
  modelVersion: "model.v1",
  dataCutoff: "2026-09-06T10:00:00.000Z",
  normalizationVersion: "no-vig.v1" as const,
  qualityPolicyVersion: "quality.v1" as const,
  rankingPolicyVersion: "rank.v1" as const,
  sourceObservations: [
    {
      provider: "provider-a",
      externalId: "odds-1",
      observedAt: "2026-09-06T09:58:00.000Z",
      receivedAt: "2026-09-06T09:59:00.000Z",
      normalizedAt: "2026-09-06T10:00:00.000Z",
      normalizationVersion: "no-vig.v1" as const,
    },
  ],
};

describe("backtest provenance and leakage guards", () => {
  it("accepts a complete pre-event record with traceable, cutoff-bounded inputs", () => {
    // Break caught: accepting a record without all provenance fields makes it impossible to audit a backtest prediction.
    const record = validateBacktestRecord({
      event: {
        id: "match-1",
        startsAt: "2026-09-06T12:00:00.000Z",
        completedAt: "2026-09-06T14:00:00.000Z",
      },
      predictionGeneratedAt: "2026-09-06T10:00:00.000Z",
      featureCutoff: "2026-09-06T09:59:00.000Z",
      marketObservationCutoff: "2026-09-06T09:59:00.000Z",
      modelVersion: "model.v1",
      probability: "0.6",
      price: "1.85",
      result: { outcome: 1, observedAt: "2026-09-06T14:01:00.000Z" },
      quality,
      traceability: provenance,
      inputs: [
        { kind: "ODDS", observedAt: "2026-09-06T09:59:00.000Z" },
        { kind: "LINEUP", observedAt: "2026-09-06T09:58:00.000Z" },
      ],
    });

    expect(record).toMatchObject({
      ok: true,
      value: { modelVersion: "model.v1" },
    });
  });

  it.each([
    ["future odds", "ODDS", "2026-09-06T10:00:00.001Z", "FUTURE_ODDS"],
    ["future lineup", "LINEUP", "2026-09-06T10:00:00.001Z", "FUTURE_LINEUP"],
    [
      "input beyond cutoff",
      "FEATURE",
      "2026-09-06T10:00:00.001Z",
      "INPUT_BEYOND_CUTOFF",
    ],
  ] as const)("rejects %s", (_name, kind, observedAt, code) => {
    // Break caught: accepting data after the prediction cutoff leaks future information into a historical result.
    const record = validateBacktestRecord({
      event: {
        id: "match-1",
        startsAt: "2026-09-06T12:00:00.000Z",
        completedAt: "2026-09-06T14:00:00.000Z",
      },
      predictionGeneratedAt: "2026-09-06T10:00:00.000Z",
      featureCutoff: "2026-09-06T09:59:00.000Z",
      marketObservationCutoff: "2026-09-06T09:59:00.000Z",
      modelVersion: "model.v1",
      probability: "0.6",
      price: "1.85",
      result: { outcome: 1, observedAt: "2026-09-06T14:01:00.000Z" },
      quality,
      traceability: provenance,
      inputs: [{ kind, observedAt }],
    });

    expect(record).toMatchObject({ ok: false, error: { code } });
  });

  it("rejects a result observed before match completion", () => {
    // Break caught: using a post-match result before the event ends is target leakage.
    expect(
      validateBacktestRecord({
        event: {
          id: "match-1",
          startsAt: "2026-09-06T12:00:00.000Z",
          completedAt: "2026-09-06T14:00:00.000Z",
        },
        predictionGeneratedAt: "2026-09-06T10:00:00.000Z",
        featureCutoff: "2026-09-06T09:59:00.000Z",
        marketObservationCutoff: "2026-09-06T09:59:00.000Z",
        modelVersion: "model.v1",
        probability: "0.6",
        price: "1.85",
        result: { outcome: 1, observedAt: "2026-09-06T13:59:59.999Z" },
        quality,
        traceability: provenance,
        inputs: [],
      }),
    ).toMatchObject({ ok: false, error: { code: "POST_MATCH_RESULT" } });
  });

  it("validates complete model provenance independently", () => {
    // Break caught: an observation normalized after the declared cutoff cannot support a reproducible prediction.
    expect(validateModelProvenance(provenance)).toMatchObject({ ok: true });
    expect(
      validateModelProvenance({
        ...provenance,
        sourceObservations: [
          {
            ...provenance.sourceObservations[0],
            normalizedAt: "2026-09-06T10:00:00.001Z",
          },
        ],
      }),
    ).toMatchObject({ ok: false, error: { code: "PROVENANCE_AFTER_CUTOFF" } });
  });
});
