import { describe, expect, it } from "vitest";
import {
  consumePredictionJob,
  consumeQueuedPredictionJob,
  consumeQueuedPredictionJobWithInputs,
  InMemoryPredictionRepository,
  processPredictionJobOnce,
  processScoreJobOnce,
  consumeQueuedEdgeJob,
  consumeQueuedRadarJob,
  DatabasePredictionJobHandler,
  scoreDefinitionMetadata,
  type PredictionJob,
} from "../src/index.js";
import type { DecimalString } from "@velyq/decimal";

const asDecimal = (value: string) => value as DecimalString;

describe("score definition formula validation", () => {
  it("fails closed for malformed or negative persisted formula values", () => {
    expect(() =>
      scoreDefinitionMetadata({ weights: { movement: "not-a-decimal" } }),
    ).toThrow("INVALID_SCORE_DEFINITION_FORMULA");
    expect(() =>
      scoreDefinitionMetadata({ capsPenalties: { movementPenalty: "-0.1" } }),
    ).toThrow("INVALID_SCORE_DEFINITION_FORMULA");
  });
});

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
  it("rejects invalid jobs before touching the durable database", async () => {
    const handler = new DatabasePredictionJobHandler({} as never);
    await expect(
      handler.handle({ type: "CALCULATE_EDGE" } as never),
    ).rejects.toThrow("INVALID_GENERATE_PREDICTION_JOB");
  });

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

  it("orchestrates validated EDGE and RADAR jobs through the score writer", async () => {
    const writes: unknown[] = [];
    const writer = {
      append: async (value: unknown) => void writes.push(value),
    };
    const edgeJob = {
      ...job(),
      id: "edge-job",
      type: "CALCULATE_EDGE" as const,
      contractVersion: "CALCULATE_EDGE.v1" as const,
      status: "PENDING" as const,
      attemptCount: 0,
      maxAttempts: 3,
      availableAt: "2026-09-03T11:00:00.000Z",
      leaseExpiresAt: null,
      lastError: null,
      startedAt: null,
      completedAt: null,
      payload: {
        eventId: "event-1",
        eventMarketOutcomeId: "outcome-1",
        predictionId: "prediction-1",
        scoreDefinitionVersionId: "edge.v1",
        asOf: "2026-09-03T11:00:00.000Z",
      },
    };
    const edge = await consumeQueuedEdgeJob(
      edgeJob,
      {
        getInput: async () => ({
          probabilityEdge: asDecimal("0.1"),
          expectedValue: asDecimal("0.2"),
          qualityScore: asDecimal("1"),
        }),
      },
      writer,
    );
    expect(edge.validationStatus).toBe("DEVELOPMENT_HEURISTIC");
    expect(edge.predictionId).toBe("prediction-1");
    expect(writes).toHaveLength(1);

    const scoreCalls: string[] = [];
    const scoreLoop = await processScoreJobOnce(
      {
        leaseNext: async () => ({
          job: edgeJob,
          leaseExpiresAt: "2026-09-03T11:01:00Z",
        }),
        complete: async (id: string) => {
          scoreCalls.push(`complete:${id}`);
          return edgeJob;
        },
        fail: async (id: string) => {
          scoreCalls.push(`fail:${id}`);
          return edgeJob;
        },
      },
      {
        getInput: async () => ({
          probabilityEdge: asDecimal("0.1"),
          expectedValue: asDecimal("0.2"),
          qualityScore: asDecimal("1"),
        }),
      },
      { getInput: async () => null },
      writer,
      {
        workerId: "score-worker",
        now: new Date("2026-09-03T11:00:00Z"),
        leaseDurationMs: 30_000,
      },
    );
    expect(scoreLoop.status).toBe("COMPLETED");
    expect(scoreCalls).toEqual(["complete:edge-job"]);

    const radarJob = {
      ...edgeJob,
      id: "radar-job",
      type: "CALCULATE_RADAR" as const,
      contractVersion: "CALCULATE_RADAR.v1" as const,
      payload: {
        eventId: "event-1",
        eventMarketOutcomeId: "outcome-1",
        scoreDefinitionVersionId: "radar.v1",
        openingObservationId: "opening-1",
        currentObservationId: "current-1",
        asOf: "2026-09-03T11:00:00.000Z",
      },
    };
    const radar = await consumeQueuedRadarJob(
      radarJob,
      {
        getInput: async () => ({
          openingOdds: asDecimal("2"),
          currentOdds: asDecimal("1.8"),
          bookmakerCoverage: 2,
          observedAt: "2026-09-03T10:55:00.000Z",
        }),
      },
      writer,
    );
    expect(radar.radarEvidence?.openingObservationId).toBe("opening-1");
    expect(radar.radarEvidence?.bookmakersObserved).toBe(2);
    expect(radar.radarEvidence?.bookmakersMoving).toBe(2);
    expect(writes).toHaveLength(3);
  });
});
