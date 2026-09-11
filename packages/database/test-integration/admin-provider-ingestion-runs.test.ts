import { afterAll, beforeAll, describe, expect, it } from "vitest";

// This real-Postgres contract intentionally exercises the admin consumer too.
// eslint-disable-next-line velyq/no-cross-package-relative-import
import { DatabaseAdminQueries } from "../../../apps/admin/app/database-admin.js";
import { createPrivilegedDatabaseClient } from "../src/client.js";
import { ensureFootballReferenceData } from "../src/repositories/odds-ingestion.js";
import {
  providerIngestionRuns,
  providerSyncRuns,
} from "../src/schema/operations.js";

const DATABASE_URL =
  process.env["DATABASE_URL"] ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const client = createPrivilegedDatabaseClient({
  connectionString: DATABASE_URL,
});
const database = client.database;

describe("admin live provider-ingestion diagnostics, against a real database", () => {
  const queries = new DatabaseAdminQueries(database);
  let idleRunId = "";
  let blockedRunId = "";
  let errorRunId = "";
  let providerId = "";

  beforeAll(async () => {
    const reference = await ensureFootballReferenceData(
      database,
      "ADMIN_LIVE_INGESTION_TEST",
    );
    providerId = reference.providerId;

    await database.insert(providerSyncRuns).values([
      {
        providerId: reference.providerId,
        capability: "RESULT_REPLAY",
        status: "FAILED",
        replaySequence: "result-replay-must-not-count-as-live-health-a",
        providerSchemaVersion: "test.v1",
        normalizationVersion: "test.v1",
        mappingVersion: "test.v1",
        policyVersionId: reference.policyVersionId,
        startedAt: new Date("2298-01-01T00:00:00.000Z"),
        completedAt: new Date("2298-01-01T00:00:01.000Z"),
        errorSummary: {
          code: "REPLAY_ONLY",
          message: "fixture replay failed",
        },
      },
      {
        providerId: reference.providerId,
        capability: "RESULT_REPLAY",
        status: "FAILED",
        replaySequence: "result-replay-must-not-count-as-live-health-b",
        providerSchemaVersion: "test.v1",
        normalizationVersion: "test.v1",
        mappingVersion: "test.v1",
        policyVersionId: reference.policyVersionId,
        startedAt: new Date("2298-01-01T00:01:00.000Z"),
        completedAt: new Date("2298-01-01T00:01:01.000Z"),
        errorSummary: {
          code: "REPLAY_ONLY",
          message: "another fixture replay failed",
        },
      },
      {
        providerId: reference.providerId,
        capability: "RESULT_REPLAY",
        status: "COMPLETED",
        replaySequence: "result-replay-must-not-be-live-success",
        providerSchemaVersion: "test.v1",
        normalizationVersion: "test.v1",
        mappingVersion: "test.v1",
        policyVersionId: reference.policyVersionId,
        startedAt: new Date("2299-01-01T00:00:00.000Z"),
        completedAt: new Date("2299-01-01T00:00:01.000Z"),
      },
    ]);

    const [idle] = await database
      .insert(providerIngestionRuns)
      .values({
        providerId: reference.providerId,
        trigger: "SCHEDULER",
        quotaDay: "2298-01-02",
        quotaPolicyVersion: "test.v1",
        startedAt: new Date("2298-01-02T00:00:00.000Z"),
        finishedAt: new Date("2298-01-02T00:00:01.000Z"),
        status: "COMPLETED",
        providerCallsUsed: 0,
        quotaStateAtStart: "HEALTHY",
        quotaStateAtEnd: "HEALTHY",
        quotaRemainingAtEnd: 7_400,
        skippedByReason: {},
        errorsByReason: {},
      })
      .returning({ id: providerIngestionRuns.id });
    idleRunId = idle!.id;

    const [blocked] = await database
      .insert(providerIngestionRuns)
      .values({
        providerId: reference.providerId,
        trigger: "SCHEDULER",
        quotaDay: "2298-01-02",
        quotaPolicyVersion: "test.v1",
        startedAt: new Date("2298-01-02T01:00:00.000Z"),
        finishedAt: new Date("2298-01-02T01:00:01.000Z"),
        status: "COMPLETED",
        providerCallsUsed: 0,
        quotaStateAtStart: "EXHAUSTED",
        quotaStateAtEnd: "EXHAUSTED",
        quotaRemainingAtEnd: 0,
        oddsCandidates: 2,
        skippedByReason: { ODDS_QUOTA_EXHAUSTED: 1 },
        errorsByReason: {},
      })
      .returning({ id: providerIngestionRuns.id });
    blockedRunId = blocked!.id;

    const [error] = await database
      .insert(providerIngestionRuns)
      .values({
        providerId: reference.providerId,
        trigger: "MANUAL",
        quotaDay: "2298-01-03",
        quotaPolicyVersion: "test.v1",
        startedAt: new Date("2298-01-03T00:00:00.000Z"),
        finishedAt: new Date("2298-01-03T00:00:02.000Z"),
        status: "COMPLETED",
        providerCallsUsed: 3,
        quotaStateAtStart: "HEALTHY",
        quotaStateAtEnd: "HEALTHY",
        quotaRemainingAtEnd: 7_397,
        oddsCandidates: 2,
        oddsRequestsAttempted: 1,
        oddsObservationsReceived: 3,
        oddsObservationsWritten: 2,
        oddsDuplicates: 1,
        lineupCandidates: 1,
        lineupRequestsAttempted: 1,
        lineupsReceived: 1,
        lineupsWritten: 1,
        lineupsOfficial: 1,
        resultCandidates: 2,
        resultRequestsAttempted: 1,
        resultsReceived: 0,
        resultsWritten: 0,
        settlementsWritten: 0,
        skippedByReason: { RESULT_BATCH_CEILING: 1 },
        errorsByReason: { RESULT_RATE_LIMITED: 1 },
      })
      .returning({ id: providerIngestionRuns.id });
    errorRunId = error!.id;
  });

  afterAll(async () => {
    await client.close();
  });

  it("lists live scheduler rows rather than allowing replay provenance to substitute for health", async () => {
    const page = await queries.listProviderIngestionRuns({
      limit: 100,
      cursor: null,
    });
    const testRuns = page.items.filter(
      (run) => run.providerCode === "ADMIN_LIVE_INGESTION_TEST",
    );

    expect(testRuns.map((run) => run.id)).toEqual([
      errorRunId,
      blockedRunId,
      idleRunId,
    ]);
    expect(testRuns.map((run) => run.id)).not.toContain(
      "result-replay-must-not-count-as-live-health-a",
    );
    expect(testRuns[2]).toMatchObject({
      trigger: "SCHEDULER",
      status: "COMPLETED",
      runHealth: "HEALTHY_IDLE",
      providerCallsUsed: 0,
      resultOutcome: "NOT_ATTEMPTED",
      skippedByReason: {},
      errorsByReason: {},
    });
    expect(testRuns[1]).toMatchObject({
      runHealth: "QUOTA_BLOCKED",
      providerCallsUsed: 0,
      odds: { candidates: 2, requestsAttempted: 0 },
      skippedByReason: { ODDS_QUOTA_EXHAUSTED: 1 },
    });
  });

  it("returns enough attempt, write, skip, and error detail to diagnose a live result failure", async () => {
    const run = await queries.getProviderIngestionRun(errorRunId);

    expect(run).toMatchObject({
      runHealth: "COMPLETED_WITH_ERRORS",
      resultOutcome: "FAILED",
      odds: {
        candidates: 2,
        requestsAttempted: 1,
        received: 3,
        written: 2,
        duplicates: 1,
      },
      lineups: {
        candidates: 1,
        requestsAttempted: 1,
        received: 1,
        written: 1,
        duplicates: 0,
        official: 1,
      },
      results: {
        candidates: 2,
        requestsAttempted: 1,
        received: 0,
        written: 0,
        duplicates: 0,
        settlementsWritten: 0,
      },
      skippedByReason: { RESULT_BATCH_CEILING: 1 },
      errorsByReason: { RESULT_RATE_LIMITED: 1 },
    });
  });

  it("derives result failure and last success only from live ingestion runs", async () => {
    const overview = await queries.getIntelligenceOverview();

    expect(overview.resultIngestionFailures).toBe(1);
    expect(overview.lastSuccessfulResultSync).toBeNull();
  });

  it("uses an insertion-stable started-at and id keyset cursor", async () => {
    const firstPage = await queries.listProviderIngestionRuns({
      limit: 1,
      cursor: null,
    });
    expect(firstPage.items[0]?.id).toBe(errorRunId);
    expect(firstPage.nextCursor).not.toBeNull();

    await database.insert(providerIngestionRuns).values({
      providerId,
      trigger: "MANUAL",
      quotaDay: "2299-01-02",
      quotaPolicyVersion: "test.v1",
      startedAt: new Date("2299-01-02T00:00:00.000Z"),
      finishedAt: new Date("2299-01-02T00:00:01.000Z"),
      status: "COMPLETED",
      providerCallsUsed: 0,
      skippedByReason: {},
      errorsByReason: {},
    });

    const secondPage = await queries.listProviderIngestionRuns({
      limit: 1,
      cursor: firstPage.nextCursor,
    });
    expect(secondPage.items[0]?.id).toBe(blockedRunId);
  });
});
