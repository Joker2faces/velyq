import { describe, expect, it } from "vitest";

import {
  assessDecisionQuality,
  buildEvidenceTimeline,
  buildMatchIntelligence,
  diffDecisionSnapshots,
  evaluateDecision,
  evaluatePriceValidity,
  type DecisionSnapshot,
} from "../src/index.js";

const price = evaluatePriceValidity({
  modelProbability: "0.6",
  currentOdds: "1.85",
});
const quality = assessDecisionQuality({
  price,
  freshness: "FRESH",
  coverage: "SUFFICIENT",
  lineup: "OFFICIAL",
});
const decision = evaluateDecision({
  price,
  freshness: "FRESH",
  coverage: "SUFFICIENT",
  lineup: "OFFICIAL",
  edgePreviouslyPresent: false,
});

function snapshot(overrides: Partial<DecisionSnapshot> = {}): DecisionSnapshot {
  return {
    price: "1.85",
    modelProbability: "0.6",
    expectedValue: "0.11",
    edge: "0.059",
    lineup: "OFFICIAL",
    quality,
    decision,
    reasonCodes: ["POSITIVE_EXPECTED_VALUE"],
    timestamp: "2026-09-06T10:00:00.000Z",
    modelVersion: "model.2026-09-06",
    cutoff: "2026-09-06T12:00:00.000Z",
    traceability: { evidenceIds: ["price-1", "model-1"] },
    ...overrides,
  };
}

describe("evidence timeline", () => {
  it("orders evidence by observed timestamp and then effective timestamp without adding events", () => {
    // Break caught: sorting by input order or fabricating a timeline event would produce a false audit trail.
    const timeline = buildEvidenceTimeline([
      {
        type: "LINEUP",
        source: "official-feed",
        observedAt: "2026-09-06T10:05:00.000Z",
        effectiveAt: "2026-09-06T10:00:00.000Z",
        freshness: "FRESH",
        referenceId: "lineup-1",
        status: "AVAILABLE",
      },
      {
        type: "PRICE",
        source: "market-feed",
        observedAt: "2026-09-06T10:00:00.000Z",
        effectiveAt: "2026-09-06T10:04:00.000Z",
        freshness: "FRESH",
        referenceId: "price-later",
        status: "AVAILABLE",
      },
      {
        type: "MODEL",
        source: "model-run",
        observedAt: "2026-09-06T10:00:00.000Z",
        effectiveAt: "2026-09-06T10:01:00.000Z",
        freshness: "FRESH",
        referenceId: "model-1",
        status: "AVAILABLE",
      },
    ]);

    expect(timeline.map((entry) => entry.referenceId)).toEqual([
      "model-1",
      "price-later",
      "lineup-1",
    ]);
    expect(timeline).toHaveLength(3);
    expect(Object.isFrozen(timeline)).toBe(true);
  });
});

describe("decision snapshot history", () => {
  it("emits only material changes between snapshots", () => {
    // Break caught: recording a one-cent price move as material creates noisy, misleading decision history.
    const prior = snapshot();
    const next = snapshot({
      price: "1.86",
      timestamp: "2026-09-06T10:01:00.000Z",
    });

    expect(diffDecisionSnapshots(prior, next)).toEqual([]);
  });

  it("records material price, lineup, quality, decision, edge, and EV changes", () => {
    // Break caught: omitting a material changed input from history makes the decision no longer explainable.
    const nextDecision = evaluateDecision({
      price: evaluatePriceValidity({
        modelProbability: "0.6",
        currentOdds: "1.5",
      }),
      freshness: "FRESH",
      coverage: "SUFFICIENT",
      lineup: "CHANGED",
      edgePreviouslyPresent: true,
    });
    const nextQuality = assessDecisionQuality({
      price,
      freshness: "STALE",
      coverage: "LOW",
      lineup: "CHANGED",
    });
    const changes = diffDecisionSnapshots(
      snapshot(),
      snapshot({
        price: "1.65",
        expectedValue: "0.05",
        edge: "0.02",
        lineup: "CHANGED",
        quality: nextQuality,
        decision: nextDecision,
      }),
    );

    expect(changes.map((change) => change.type)).toEqual([
      "PRICE",
      "LINEUP",
      "QUALITY",
      "DECISION",
      "EDGE",
      "EV",
    ]);
    expect(
      changes.every((change) => change.policyVersion === "materiality.v1"),
    ).toBe(true);
  });
});

describe("match intelligence contract", () => {
  it("is frozen and JSON-safe while retaining the decision trace", () => {
    // Break caught: a non-serializable or incomplete aggregate loses the audit evidence needed to explain the decision.
    const intelligence = buildMatchIntelligence({
      snapshot: snapshot(),
      evidence: [
        {
          type: "PRICE",
          source: "market-feed",
          observedAt: "2026-09-06T10:00:00.000Z",
          effectiveAt: "2026-09-06T10:00:00.000Z",
          freshness: "FRESH",
          referenceId: "price-1",
          status: "AVAILABLE",
        },
      ],
      previousSnapshot: null,
    });

    expect(intelligence).toMatchObject({
      policyVersions: {
        quality: "quality.v1",
        decision: "decision.v1",
        materiality: "materiality.v1",
      },
      evidenceTimeline: [{ referenceId: "price-1" }],
      changes: [],
    });
    expect(Object.isFrozen(intelligence)).toBe(true);
    expect(JSON.parse(JSON.stringify(intelligence))).toEqual(intelligence);
  });
});
