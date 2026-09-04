import { describe, expect, it } from "vitest";
import {
  consumePredictionJob,
  consumeQueuedPredictionJob,
  consumeQueuedPredictionJobWithInputs,
  InMemoryPredictionRepository,
  processPredictionJobOnce,
  type PredictionJob,
} from "../src/index.js";
import type { DecimalString } from "@velyq/decimal";

const asDecimal = (value: string) => value as DecimalString;

function job(overrides: Partial<PredictionJob["payload"]> = {}): PredictionJob {
  return {
    id: "job-prediction-1",
    idempotencyKey: "prediction:event-1:cutoff-1",
    createdAt: "2026-09-03T11:00:00.000Z",
    correlationId: "correlation-1",
    causationId: "causation-1",
    payload: {
      eventId: "event-1",
      eventMarketOutcomeId: "outcome-1",
      modelProbability: asDecimal("0.6"),
      currentOdds: asDecimal("2"),
      quality: {
        policyVersion: "quality-v1",
        asOf: "2026-09-03T11:00:00.000Z",
        receivedAt: "2026-09-03T10:55:00.000Z",
        priceCount: 3,
        bookmakerCount: 2,
        lineup: "OFFICIAL",
        mappingConfidence: "HIGH",
        edgeAvailable: true,
        edgePresent: true,
      },
      featureCutoff: "2026-09-03T10:55:00.000Z",
      modelVersion: "model-v1",
      calibrationVersion: "calibration-v1",
      sourceObservationIds: ["observation-1"],
      ...overrides,
    },
  };
}

describe("prediction worker", () => {
  it("generates deterministic value metrics and trace metadata", () => {
    const repository = new InMemoryPredictionRepository();
    const result = consumePredictionJob(job(), repository);

    expect(result.duplicate).toBe(false);
    expect(result.prediction.decisionStatus).toBe("STRONG_EDGE");
    expect(result.prediction.modelProbability).toBe("0.6");
    expect(result.prediction.fairOdds).toBe("1.666666666666666666666666666667");
    expect(result.prediction.marketImpliedProbability).toBe("0.5");
    expect(result.prediction.edge).toBe("0.1");
    expect(result.prediction.expectedValue).toBe("0.2");
    expect(result.prediction.trace).toEqual({
      triggerJobId: "job-prediction-1",
      correlationId: "correlation-1",
      causationId: "causation-1",
      featureCutoff: "2026-09-03T10:55:00.000Z",
      modelVersion: "model-v1",
      calibrationVersion: "calibration-v1",
      sourceObservationIds: ["observation-1"],
    });
  });

  it("refuses stale or incomplete inputs with null prediction metrics", () => {
    const result = consumePredictionJob(
      job({
        quality: {
          ...job().payload.quality,
          receivedAt: "2026-09-03T10:00:00.000Z",
          lineup: "MISSING",
        },
      }),
    );

    expect(result.prediction.decisionStatus).toBe("WAIT");
    expect(result.prediction.modelProbability).toBeNull();
    expect(result.prediction.fairOdds).toBeNull();
    expect(result.prediction.edge).toBeNull();
    expect(result.prediction.reasonCodes).toContain("STALE_DATA");
    expect(result.prediction.reasonCodes).toContain("QUALITY_GATE_REFUSED");
  });

  it("persists one result per idempotency key and replays it", () => {
    const repository = new InMemoryPredictionRepository();
    const first = consumePredictionJob(job(), repository);
    const second = consumePredictionJob(
      { ...job(), createdAt: "2026-09-03T11:01:00.000Z" },
      repository,
    );

    expect(first.prediction).toBe(second.prediction);
    expect(second.duplicate).toBe(true);
  });

  it("consumes the versioned queued job contract", () => {
    const input = job();
    const result = consumeQueuedPredictionJob({
      ...input,
      type: "GENERATE_PREDICTION",
      contractVersion: "GENERATE_PREDICTION.v1",
      status: "PENDING",
      attemptCount: 0,
      maxAttempts: 3,
      availableAt: input.createdAt,
      leaseExpiresAt: null,
      lastError: null,
      startedAt: null,
      completedAt: null,
    });
    expect(result.prediction.trace.triggerJobId).toBe(input.id);
  });

  it("rejects missing or post-cutoff prediction inputs", async () => {
    const input = job();
    const queued = {
      ...input,
      type: "GENERATE_PREDICTION" as const,
      contractVersion: "GENERATE_PREDICTION.v1" as const,
      status: "PENDING" as const,
      attemptCount: 0,
      maxAttempts: 3,
      availableAt: input.createdAt,
      leaseExpiresAt: null,
      lastError: null,
      startedAt: null,
      completedAt: null,
    };
    await expect(
      consumeQueuedPredictionJobWithInputs(queued, {
        getByIds: async () => [],
      }),
    ).rejects.toThrow("PREDICTION_INPUTS_MISSING");
    await expect(
      consumeQueuedPredictionJobWithInputs(queued, {
        getByIds: async () => [
          {
            id: "observation-1",
            eventId: "event-1",
            eventMarketOutcomeId: "outcome-1",
            receivedAt: "2026-09-03T11:00:00.000Z",
          },
        ],
      }),
    ).rejects.toThrow("PREDICTION_INPUTS_OUTSIDE_CUTOFF");
  });

  it("completes a leased job and fails a rejected job through the durable queue port", async () => {
    const input = job();
    const queued = {
      ...input,
      type: "GENERATE_PREDICTION" as const,
      contractVersion: "GENERATE_PREDICTION.v1" as const,
      status: "PENDING" as const,
      attemptCount: 0,
      maxAttempts: 3,
      availableAt: input.createdAt,
      leaseExpiresAt: null,
      lastError: null,
      startedAt: null,
      completedAt: null,
    };
    const calls: string[] = [];
    const queue = {
      leaseNext: async () => ({
        job: queued,
        leaseExpiresAt: "2026-09-03T11:01:00Z",
      }),
      complete: async (jobId: string) => {
        calls.push(`complete:${jobId}`);
        return queued;
      },
      fail: async (jobId: string) => {
        calls.push(`fail:${jobId}`);
        return queued;
      },
    };
    const reader = {
      getByIds: async () => [
        {
          id: "observation-1",
          eventId: "event-1",
          eventMarketOutcomeId: "outcome-1",
          receivedAt: "2026-09-03T10:55:00Z",
        },
      ],
    };
    const completed = await processPredictionJobOnce(
      queue,
      reader,
      new InMemoryPredictionRepository(),
      {
        workerId: "prediction-worker",
        now: new Date(input.createdAt),
        leaseDurationMs: 30_000,
      },
    );
    expect(completed.status).toBe("COMPLETED");
    expect(calls).toEqual(["complete:job-prediction-1"]);

    const failed = await processPredictionJobOnce(
      queue,
      { getByIds: async () => [] },
      new InMemoryPredictionRepository(),
      {
        workerId: "prediction-worker",
        now: new Date(input.createdAt),
        leaseDurationMs: 30_000,
      },
    );
    expect(failed.status).toBe("FAILED");
    expect(calls).toEqual([
      "complete:job-prediction-1",
      "fail:job-prediction-1",
    ]);
  });
});
