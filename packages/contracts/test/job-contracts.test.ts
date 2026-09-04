import { describe, expect, it } from "vitest";
import { validateJob } from "../src/index.js";

const base = {
  id: "job-1",
  status: "PENDING" as const,
  attemptCount: 0,
  maxAttempts: 3,
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
});
