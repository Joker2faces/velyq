import { and, desc, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runProviderIngestion } from "@velyq/application/provider-ingestion";
import type { NormalizedResult } from "@velyq/providers";

// This real-Postgres contract intentionally exercises the Admin consumer too.
// eslint-disable-next-line velyq/no-cross-package-relative-import
import { DatabaseAdminQueries } from "../../../apps/admin/app/database-admin.js";
import { createPrivilegedDatabaseClient } from "../src/client.js";
import { ensureFootballReferenceData } from "../src/repositories/odds-ingestion.js";
import { createProviderIngestionAdapter } from "../src/repositories/provider-ingestion-adapter.js";
import {
  competitions,
  eventIdentities,
  events,
} from "../src/schema/catalog.js";
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

describe("Admin diagnosis of a real result persistence failure", () => {
  const queries = new DatabaseAdminQueries(database);
  const now = new Date("2300-01-01T12:00:00.000Z");
  let providerId = "";
  let providerFixtureId = "";
  let competitionId = "";
  let eventId = "";
  let syncRunIdsBefore: ReadonlySet<string> = new Set();

  beforeAll(async () => {
    const reference = await ensureFootballReferenceData(database, "API_SPORTS");
    providerId = reference.providerId;
    syncRunIdsBefore = new Set(
      (
        await database
          .select({ id: providerSyncRuns.id })
          .from(providerSyncRuns)
          .where(eq(providerSyncRuns.providerId, providerId))
      ).map((row) => row.id),
    );
    const suffix = crypto.randomUUID();
    providerFixtureId = `admin-result-write-failure-${suffix}`;

    const [competition] = await database
      .insert(competitions)
      .values({
        sportId: reference.sportId,
        code: `ADMIN_RESULT_WRITE_FAILURE_${suffix}`,
        nameKey: "competition.admin_result_write_failure",
        countryCode: "GR",
      })
      .returning({ id: competitions.id });
    competitionId = competition!.id;

    await database.transaction(async (transaction) => {
      const [event] = await transaction
        .insert(events)
        .values({
          sportId: reference.sportId,
          competitionId,
          seasonLabel: "2299/2300",
          startsAt: new Date("2299-12-31T18:00:00.000Z"),
          status: "NS",
          synthetic: false,
        })
        .returning({ id: events.id });
      eventId = event!.id;
      await transaction.insert(eventIdentities).values({
        eventId,
        providerId,
        providerFixtureId,
      });
    });
  });

  afterAll(async () => {
    await database
      .delete(providerIngestionRuns)
      .where(
        and(
          eq(providerIngestionRuns.providerId, providerId),
          eq(providerIngestionRuns.startedAt, now),
        ),
      );
    const createdSyncRunIds = (
      await database
        .select({ id: providerSyncRuns.id })
        .from(providerSyncRuns)
        .where(eq(providerSyncRuns.providerId, providerId))
    )
      .map((row) => row.id)
      .filter((id) => !syncRunIdsBefore.has(id));
    if (createdSyncRunIds.length > 0)
      await database
        .delete(providerSyncRuns)
        .where(inArray(providerSyncRuns.id, createdSyncRunIds));
    await database
      .delete(eventIdentities)
      .where(eq(eventIdentities.eventId, eventId));
    await database.delete(events).where(eq(events.id, eventId));
    await database
      .delete(competitions)
      .where(eq(competitions.id, competitionId));
    await client.close();
  });

  it("keeps RESULT_WRITE_FAILED visible as a failed live result run and out of last success", async () => {
    const adapter = await createProviderIngestionAdapter(database, {
      clock: () => now,
      client: {
        async get() {
          throw new Error("provider client must not be called directly");
        },
      },
    });
    const beforeIds = new Set(
      (
        await database
          .select({ id: providerIngestionRuns.id })
          .from(providerIngestionRuns)
          .where(
            and(
              eq(providerIngestionRuns.providerId, providerId),
              eq(providerIngestionRuns.startedAt, now),
            ),
          )
      ).map((row) => row.id),
    );
    const beforeOverview = await queries.getIntelligenceOverview();
    const invalidResult = {
      sport: "FOOTBALL",
      providerEventId: providerFixtureId,
      status: "INVALID_DATABASE_STATUS",
      homeScore: 2,
      awayScore: 1,
      providerObservedAt: null,
      receivedAt: now.toISOString(),
      provider: "API_SPORTS",
      sourceReference: "admin-result-write-failure-test",
    } as unknown as NormalizedResult;

    const result = await runProviderIngestion(
      {
        ...adapter.deps,
        loadQuotaSnapshot: async () => ({
          remaining: 100,
          dailyLimit: 100,
          quotaDay: "2300-01-01",
          observedAt: now,
        }),
        recordQuotaObservation: async () => undefined,
        recordRequestAttempt: async () => undefined,
        spentToday: async () => ({
          DISCOVERY: 0,
          ODDS: 0,
          LINEUP: 0,
          RESULT: 0,
        }),
        discoveryDueDates: async () => [],
        lineupCandidates: async () => [],
        oddsCandidates: async () => [],
        resultCandidates: async () => [
          {
            providerFixtureId,
            kickoffAt: new Date("2299-12-31T18:00:00.000Z"),
          },
        ],
        fetchResults: async () => ({
          ok: true,
          value: [invalidResult],
          quota: { remaining: 99, dailyLimit: 100, observedAt: now },
        }),
      },
      { trigger: "MANUAL" },
    );

    expect(result.skippedByReason).toMatchObject({ RESULT_WRITE_FAILED: 1 });
    expect(result.errorsByReason).toEqual({});
    await adapter.recordRun(result);

    const persistedRows = await database
      .select({ id: providerIngestionRuns.id })
      .from(providerIngestionRuns)
      .where(
        and(
          eq(providerIngestionRuns.providerId, providerId),
          eq(providerIngestionRuns.startedAt, now),
        ),
      )
      .orderBy(desc(providerIngestionRuns.createdAt));
    const persisted = persistedRows.find((row) => !beforeIds.has(row.id));
    expect(persisted).toBeDefined();

    const page = await queries.listProviderIngestionRuns({
      limit: 100,
      cursor: null,
    });
    expect(page.items.find((run) => run.id === persisted!.id)).toMatchObject({
      runHealth: "COMPLETED_WITH_ERRORS",
      resultOutcome: "FAILED",
      skippedByReason: { RESULT_WRITE_FAILED: 1 },
      errorsByReason: {},
    });

    await expect(
      queries.getProviderIngestionRun(persisted!.id),
    ).resolves.toMatchObject({
      runHealth: "COMPLETED_WITH_ERRORS",
      resultOutcome: "FAILED",
      skippedByReason: { RESULT_WRITE_FAILED: 1 },
    });

    const afterOverview = await queries.getIntelligenceOverview();
    expect(afterOverview.resultIngestionFailures).toBe(
      beforeOverview.resultIngestionFailures + 1,
    );
    expect(afterOverview.lastSuccessfulResultSync).toBe(
      beforeOverview.lastSuccessfulResultSync,
    );
  });
});
