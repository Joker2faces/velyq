import { describe, expect, it } from "vitest";
import { validateJob } from "../src/index.js";

const base = {
  id: "job-1",
  status: "PENDING" as const,
  attemptCount: 0,
  maxAttempts: 3,
  availableAt: "2026-09-04T10:00:00.000Z",
  createdAt: "2026-09-04T09:59:00.000Z",
  leaseExpiresAt: null,
  startedAt: null,
  completedAt: null,
  lastError: null,
  idempotencyKey: "key-1",
  correlationId: "corr-1",
  causationId: "cause-1",
};

describe("typed calculation job contracts", () => {
  it("accepts an edge payload only for the edge contract", () => {
    const result = validateJob({
      ...base,
      type: "CALCULATE_EDGE",
      contractVersion: "CALCULATE_EDGE.v1",
      payload: {
        eventId: "event-1",
        eventMarketOutcomeId: "outcome-1",
        predictionId: "prediction-1",
        scoreDefinitionVersionId: "score-1",
        asOf: "2026-09-04T10:00:00.000Z",
      },
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a prediction payload under the radar contract", () => {
    const result = validateJob({
      ...base,
      type: "CALCULATE_RADAR",
      contractVersion: "CALCULATE_RADAR.v1",
      payload: {
        eventId: "event-1",
        featureCutoff: "2026-09-04T10:00:00.000Z",
      },
    });
    expect(result.ok).toBe(false);
  });

  it("rejects an incomplete prediction payload", () => {
    const result = validateJob({
      ...base,
      type: "GENERATE_PREDICTION",
      contractVersion: "GENERATE_PREDICTION.v1",
      payload: {
        eventId: "event-1",
        eventMarketOutcomeId: "outcome-1",
        modelProbability: "0.5",
        currentOdds: "2",
        featureCutoff: "2026-09-04T10:00:00.000Z",
      },
    });
    expect(result.ok).toBe(false);
  });

  it.each([
    ["modelProbability", "0.6000000000001"],
    ["modelProbability", 0.5],
    ["currentOdds", "1"],
    ["currentOdds", "2.00"],
  ] as const)("rejects an invalid exact decimal in %s", (field, value) => {
    const result = validateJob({
      ...base,
      type: "GENERATE_PREDICTION",
      contractVersion: "GENERATE_PREDICTION.v1",
      payload: {
        eventId: "event-1",
        eventMarketOutcomeId: "outcome-1",
        modelProbability: "0.5",
        currentOdds: "2",
        quality: {
          policyVersion: "phase-1-quality.v1",
          asOf: "2026-09-04T10:00:00.000Z",
          receivedAt: "2026-09-04T09:59:00.000Z",
          priceCount: 1,
          bookmakerCount: 1,
          lineup: "OFFICIAL",
          mappingConfidence: "HIGH",
          edgeAvailable: true,
          edgePresent: true,
        },
        featureCutoff: "2026-09-04T10:00:00.000Z",
        modelVersion: "model.v1",
        calibrationVersion: "calibration.v1",
        sourceObservationIds: ["observation-1"],
        [field]: value,
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.errors).toContain(
        "payload does not match the job contract",
      );
  });
});
