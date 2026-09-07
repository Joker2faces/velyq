import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { validateJob } from "@velyq/contracts";

/**
 * The queue's row shape against the contract's job shape.
 *
 * `DatabaseJobRepository` used to return its rows with `as unknown as Job`.
 * Drizzle hands back `timestamptz` columns as `Date` objects, the contract's
 * timestamps are ISO strings, and `validateJob` checks them with `typeof
 * value === "string"` — so every job leased from the durable queue failed
 * validation and every handler threw `INVALID_<TYPE>_JOB` before doing any
 * work. The entire durable pipeline was unrunnable, and the worker tests could
 * not catch it because they build their jobs by hand instead of leasing them.
 *
 * These tests come at it from two directions: the shape itself, and a source
 * assertion that the casts have not come back. The integration test that
 * actually leases a job needs a database and lives in the local-database
 * suite; this is the part that runs everywhere.
 */

const REPOSITORY = resolve(import.meta.dirname, "../src/repositories/jobs.ts");

/** A leased row exactly as the driver produces it. */
function driverRow() {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    type: "GENERATE_PREDICTION",
    contractVersion: "GENERATE_PREDICTION.v1",
    idempotencyKey: "prediction:abc",
    payload: {
      eventId: "22222222-2222-4222-8222-222222222222",
      eventMarketOutcomeId: "33333333-3333-4333-8333-333333333333",
      modelProbability: "0.335728635865",
      currentOdds: "3.9",
      quality: {
        policyVersion: "quality.pre-event.v1",
        asOf: "2026-09-07T16:00:00.000Z",
        receivedAt: "2026-09-07T16:00:00.000Z",
        priceCount: 7,
        bookmakerCount: 7,
        lineup: "MISSING",
        mappingConfidence: "HIGH",
        edgeAvailable: true,
        edgePresent: true,
      },
      featureCutoff: "2026-09-07T16:00:00.000Z",
      modelVersion: "football-dixon-coles.v1",
      calibrationVersion: "temperature-scaling.v1",
      sourceObservationIds: ["44444444-4444-4444-8444-444444444444"],
    },
    status: "RUNNING",
    attemptCount: 1,
    maxAttempts: 3,
    availableAt: new Date("2026-09-07T16:00:00.000Z"),
    leaseExpiresAt: new Date("2026-09-07T16:01:00.000Z"),
    correlationId: "55555555-5555-4555-8555-555555555555",
    causationId: "66666666-6666-4666-8666-666666666666",
    lastError: null,
    leaseOwner: "worker-1",
    startedAt: new Date("2026-09-07T16:00:00.000Z"),
    completedAt: null,
    createdAt: new Date("2026-09-07T15:59:00.000Z"),
  };
}

/** The same row after the repository maps it onto the contract. */
function mapped(row: ReturnType<typeof driverRow>) {
  return {
    id: row.id,
    type: row.type,
    contractVersion: row.contractVersion,
    idempotencyKey: row.idempotencyKey,
    payload: row.payload,
    status: row.status,
    attemptCount: row.attemptCount,
    maxAttempts: row.maxAttempts,
    availableAt: row.availableAt.toISOString(),
    leaseExpiresAt: row.leaseExpiresAt?.toISOString() ?? null,
    correlationId: row.correlationId,
    causationId: row.causationId,
    lastError: row.lastError,
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

describe("queue rows against the job contract", () => {
  it("rejects a raw driver row, which is what the casts were passing through", () => {
    const validation = validateJob(driverRow());
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      // Named explicitly: these are the fields whose Date objects broke it.
      expect(validation.errors).toContain("availableAt is required");
      expect(validation.errors).toContain("createdAt is required");
    }
  });

  it("accepts the row once its timestamps are ISO strings", () => {
    expect(validateJob(mapped(driverRow())).ok).toBe(true);
  });

  it("accepts a row with the nullable timestamps absent", () => {
    const row = driverRow();
    const validation = validateJob(
      mapped({
        ...row,
        leaseExpiresAt: null as unknown as Date,
        startedAt: null as unknown as Date,
      }),
    );
    expect(validation.ok).toBe(true);
  });

  it("keeps the repository free of unchecked job casts", () => {
    /*
     * A source assertion rather than a behavioural one, because the defect
     * was precisely that the cast silenced the type system: any future
     * `as unknown as Job` would compile, pass every unit test, and break the
     * durable queue again in exactly the same invisible way.
     */
    const source = readFileSync(REPOSITORY, "utf8");
    const code = source
      .split("\n")
      .filter((line) => !line.trim().startsWith("*"))
      .join("\n");
    expect(code).not.toContain("as unknown as Job");
    expect(code).toContain("function toJob(");
  });
});
