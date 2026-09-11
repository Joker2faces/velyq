import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { createPrivilegedDatabaseClient } from "../src/client.js";
import { DatabaseCustomerQueryAdapter } from "../src/repositories/customer-queries.js";
import { LegacyCustomerQueryAdapter } from "./legacy-customer-queries.js";
import {
  events,
  eventIdentities,
  eventParticipants,
  eventMarkets,
  eventMarketOutcomes,
  oddsObservations,
  lineupObservations,
  dataQualityAssessments,
  predictionRuns,
  predictions,
  predictionInputs,
  scoreResults,
  radarEvidence,
  sourceObservations,
} from "../src/schema/index.js";

const client = createPrivilegedDatabaseClient({
  connectionString: process.env["DATABASE_URL"],
});
const db = client.database;
const asOf = new Date("2028-06-01T12:00:00Z");
const before = new Date("2028-06-01T10:00:00Z");
const after = new Date("2028-06-01T13:00:00Z");
const ids: string[] = [];
let demoId: string;
const live = new DatabaseCustomerQueryAdapter(db, { dataOrigin: "LIVE" });
const oracle = new LegacyCustomerQueryAdapter(db, { dataOrigin: "LIVE" });

// A dropped relation, wrong partition/cutoff, or global (rather than per-event)
// cap must change serialized output. Reintroduced fan-out must fail the budget.
describe("bulk customer reads against frozen legacy PostgreSQL semantics", () => {
  beforeAll(async () => {
    const seed = (await new LegacyCustomerQueryAdapter(db, {
      dataOrigin: "SYNTHETIC_DEMO",
    }).getMatch(
      "23000000-0000-4000-8000-000000000001",
      new Date("2026-09-03T12:00:00Z"),
    ))!;
    const [source] = await db
      .select()
      .from(sourceObservations)
      .where(
        eq(
          sourceObservations.id,
          seed.outcomes[0]!.odds[0]!.sourceObservationId,
        ),
      );
    for (let i = 0; i < 102; i++) {
      const id = randomUUID();
      if (i < 101) ids.push(id);
      else demoId = id;
      await db.transaction(async (tx) => {
        await tx.insert(events).values({
          ...seed.event,
          id,
          synthetic: i === 101,
          startsAt: new Date(
            i === 0 ? "2028-06-01T17:00:00Z" : "2028-06-01T18:00:00Z",
          ),
        });
        await tx.insert(eventIdentities).values({
          eventId: id,
          providerId: source!.providerId,
          providerFixtureId: `task14-${id}`,
        });
        await tx.insert(eventParticipants).values(
          seed.participants.map((p) => ({
            ...p.eventParticipant,
            eventId: id,
          })),
        );
        const markets = new Map<string, string>();
        for (const outcome of seed.outcomes) {
          if (!markets.has(outcome.market.id)) {
            const marketId = randomUUID();
            markets.set(outcome.market.id, marketId);
            await tx.insert(eventMarkets).values({
              ...outcome.market,
              id: marketId,
              eventId: id,
              canonicalKey: `task14-${marketId}`,
            });
          }
          const outcomeId = randomUUID();
          await tx.insert(eventMarketOutcomes).values({
            ...outcome.outcome,
            id: outcomeId,
            eventMarketId: markets.get(outcome.market.id)!,
            canonicalKey: `task14-${outcomeId}`,
          });
          const odds = outcome.odds.map((o) => ({
            ...o,
            id: randomUUID(),
            eventMarketOutcomeId: outcomeId,
            isSynthetic: i === 101,
            providerObservedAt: before,
            receivedAt: before,
          }));
          await tx.insert(oddsObservations).values(odds);
          if (i === 0 && outcome.outcomeDefinition.code === "DRAW") {
            const sourceIds = [randomUUID(), randomUUID()];
            await tx.insert(sourceObservations).values(
              sourceIds.map((sourceId) => ({
                ...source!,
                id: sourceId,
                providerExternalId: sourceId,
                contentHash: `task14-${sourceId}`,
              })),
            );
            await tx.insert(oddsObservations).values([
              {
                ...odds[0]!,
                id: "ffffffff-ffff-4fff-8fff-000000000014",
                sourceObservationId: sourceIds[0]!,
                providerObservedAt: sql`'2028-06-01T10:01:00.000001Z'::timestamptz`,
              },
              {
                ...odds[0]!,
                id: "00000000-0000-4000-8000-000000000014",
                sourceObservationId: sourceIds[1]!,
                providerObservedAt: sql`'2028-06-01T10:01:00.000002Z'::timestamptz`,
              },
            ]);
          }
          if (outcome.quality && outcome.prediction && outcome.score) {
            const qualityId = randomUUID();
            await tx.insert(dataQualityAssessments).values({
              ...outcome.quality,
              id: qualityId,
              eventId: id,
              marketOutcomeId: outcomeId,
              asOf: before,
            });
            const predictionId = randomUUID();
            const runId = randomUUID();
            await tx.insert(predictionRuns).values({
              ...outcome.prediction.run,
              id: runId,
              eventId: id,
              triggerJobId: null,
              featureCutoff: before,
            });
            await tx.insert(predictions).values({
              ...outcome.prediction.prediction,
              id: predictionId,
              predictionRunId: runId,
              eventMarketOutcomeId: outcomeId,
              dataQualityAssessmentId: qualityId,
              marketPriceObservationId: odds[0]!.id,
              createdAt: before,
            });
            await tx
              .insert(predictionInputs)
              .values(
                outcome.predictionInputs.map((p) => ({ ...p, predictionId })),
              );
            const scoreId = randomUUID();
            await tx.insert(scoreResults).values({
              ...outcome.score.result,
              id: scoreId,
              predictionId,
              eventMarketOutcomeId: outcomeId,
              dataQualityAssessmentId: qualityId,
              idempotencyKey: `task14-${scoreId}`,
              asOf: before,
            });
            if (outcome.score.radarEvidence)
              await tx.insert(radarEvidence).values({
                ...outcome.score.radarEvidence,
                id: randomUUID(),
                scoreResultId: scoreId,
                openingObservationId: odds[0]!.id,
                currentObservationId: odds.at(-1)!.id,
                supportingObservationIds: odds.map((o) => o.id),
              });
            if (i < 2 || i === 101) {
              // Tied eligible timestamps exercise UUID tiebreakers. Later rows
              // independently violate prediction creation or feature cutoff.
              for (let revision = 0; revision < 5; revision++) {
                const nextQualityId = randomUUID();
                const nextRunId = randomUUID();
                const nextPredictionId =
                  revision === 3
                    ? `ffffffff-ffff-4fff-8fff-${String(i).padStart(12, "0")}`
                    : randomUUID();
                const nextScoreId = randomUUID();
                const instant = revision === 4 ? after : asOf;
                await tx.insert(dataQualityAssessments).values({
                  ...outcome.quality,
                  id: nextQualityId,
                  eventId: id,
                  marketOutcomeId: outcomeId,
                  asOf: instant,
                  grade: `REVISION_${revision}`,
                });
                await tx.insert(predictionRuns).values({
                  ...outcome.prediction.run,
                  id: nextRunId,
                  eventId: id,
                  triggerJobId: null,
                  featureCutoff: revision === 3 ? after : before,
                });
                await tx.insert(predictions).values({
                  ...outcome.prediction.prediction,
                  id: nextPredictionId,
                  predictionRunId: nextRunId,
                  eventMarketOutcomeId: outcomeId,
                  dataQualityAssessmentId: nextQualityId,
                  marketPriceObservationId: odds[0]!.id,
                  createdAt: instant,
                });
                await tx.insert(predictionInputs).values(
                  odds.map((o) => ({
                    predictionId: nextPredictionId,
                    sourceObservationId: o.sourceObservationId,
                    inputRole: "PRICE",
                    createdAt: before,
                  })),
                );
                await tx.insert(scoreResults).values({
                  ...outcome.score.result,
                  id: nextScoreId,
                  predictionId: nextPredictionId,
                  eventMarketOutcomeId: outcomeId,
                  dataQualityAssessmentId: nextQualityId,
                  idempotencyKey: `task14-${nextScoreId}`,
                  asOf: instant,
                  createdAt: revision === 0 ? before : asOf,
                });
                if (outcome.score.radarEvidence)
                  await tx.insert(radarEvidence).values({
                    ...outcome.score.radarEvidence,
                    id: randomUUID(),
                    scoreResultId: nextScoreId,
                    openingObservationId: odds[0]!.id,
                    currentObservationId: odds.at(-1)!.id,
                  });
              }
              if (i === 1)
                await tx.insert(dataQualityAssessments).values({
                  ...outcome.quality,
                  id: randomUUID(),
                  eventId: ids[0]!,
                  marketOutcomeId: outcomeId,
                  asOf,
                  grade: "WRONG_EVENT",
                });
            }
          }
          if (i === 0 && outcome.outcomeDefinition.code === "HOME") {
            const rows = Array.from({ length: 10006 }, (_, n) => ({
              ...odds[0]!,
              id: randomUUID(),
              sourceObservationId: randomUUID(),
              providerObservedAt:
                n === 10000 ? after : new Date(before.getTime() + n * 100),
              receivedAt: n === 10001 ? after : before,
              isSynthetic: n === 10002 ? true : false,
              status: n === 10003 ? "SUSPENDED" : "ACTIVE",
            }));
            // Same opening instant across bookmakers; two-clock and corpus distractions.
            rows[10004]!.providerObservedAt = before;
            rows[10004]!.bookmakerId = "45000000-0000-4000-8000-000000000002";
            rows[10005]!.providerObservedAt = before;
            for (let start = 0; start < rows.length; start += 250) {
              const chunk = rows.slice(start, start + 250);
              await tx.insert(sourceObservations).values(
                chunk.map((o) => ({
                  ...source!,
                  id: o.sourceObservationId,
                  providerExternalId: o.id,
                  contentHash: `task14-${o.id}`,
                })),
              );
              await tx.insert(oddsObservations).values(chunk);
            }
          }
        }
        await tx.insert(lineupObservations).values(
          seed.lineups.map((l, n) => ({
            ...l,
            id: randomUUID(),
            eventId: id,
            providerObservedAt: n === 0 ? after : before,
            receivedAt: n === 1 ? after : before,
          })),
        );
        if (i === 101) {
          const over = seed.outcomes.find(
            (row) => row.outcomeDefinition.code === "OVER",
          )!;
          for (let n = 0; n < 101; n++) {
            const marketId = randomUUID();
            const outcomeId = randomUUID();
            await tx.insert(eventMarkets).values({
              ...over.market,
              id: marketId,
              eventId: id,
              lineValue: String(n + 10.5),
              canonicalKey: `task14-${marketId}`,
            });
            await tx.insert(eventMarketOutcomes).values({
              ...over.outcome,
              id: outcomeId,
              eventMarketId: marketId,
              canonicalKey: `task14-${outcomeId}`,
            });
          }
        }
      });
    }
  }, 120000);
  afterAll(async () => {
    await client.close();
  });

  it("matches legacy byte for byte at historical cutoffs in both corpora", async () => {
    for (const dataOrigin of ["LIVE", "SYNTHETIC_DEMO"] as const) {
      const reader = new DatabaseCustomerQueryAdapter(db, { dataOrigin });
      const legacy = new LegacyCustomerQueryAdapter(db, { dataOrigin });
      for (const cutoff of [
        new Date(before.getTime() - 1),
        before,
        asOf,
        after,
      ]) {
        for (const id of [ids[0]!, ids[1]!, demoId, randomUUID()]) {
          const actual = await reader.getMatch(id, cutoff);
          expect(JSON.stringify(actual)).toBe(
            JSON.stringify(await legacy.getMatch(id, cutoff)),
          );
          if (actual) {
            const outcomeId = actual.outcomes[0]!.outcome.id;
            expect(
              JSON.stringify(
                await reader.getOddsHistory(id, outcomeId, cutoff),
              ),
            ).toBe(
              JSON.stringify(
                await legacy.getOddsHistory(id, outcomeId, cutoff),
              ),
            );
          }
        }
      }
    }
  }, 60000);

  it("keeps 100-fixture getToday within 12 statements and preserves ordered output", async () => {
    const expected = await oracle.getToday(asOf);
    const spy = vi.spyOn(client.pool, "query");
    try {
      const actual = await live.getToday(asOf);
      const count = spy.mock.calls.length;
      expect(JSON.stringify(actual)).toBe(JSON.stringify(expected));
      expect(actual.matches).toHaveLength(100);
      expect(count).toBeLessThanOrEqual(12);
    } finally {
      spy.mockRestore();
    }
  }, 60000);

  it("bounds round trips at 1, 10, 100 and 101 requested fixtures without changing order or corpus", async () => {
    for (const size of [1, 10, 100, 101]) {
      const requested = ids.slice(0, size).reverse();
      const expected = await Promise.all(
        requested.map((id) => oracle.getMatch(id, asOf)),
      );
      const spy = vi.spyOn(client.pool, "query");
      try {
        const actual = await live.getMatches(
          [...requested, requested[0]!, demoId, randomUUID()],
          asOf,
        );
        expect(JSON.stringify(actual)).toBe(JSON.stringify(expected));
        expect(spy.mock.calls.length).toBeLessThanOrEqual(
          Math.ceil((size + 2) / 100) * 10,
        );
      } finally {
        spy.mockRestore();
      }
    }
    const spy = vi.spyOn(client.pool, "query");
    try {
      expect(await live.getMatches([], asOf)).toEqual([]);
      expect(spy.mock.calls).toHaveLength(0);
    } finally {
      spy.mockRestore();
    }
  }, 60000);

  it("materially reduces warm latency and statements on the same 100-fixture corpus", async () => {
    const measure = async (reader: typeof live | typeof oracle) => {
      await reader.getToday(asOf);
      const samples: number[] = [];
      const counts: number[] = [];
      for (let i = 0; i < 3; i++) {
        const spy = vi.spyOn(client.pool, "query");
        const start = performance.now();
        try {
          await reader.getToday(asOf);
          samples.push(performance.now() - start);
          counts.push(spy.mock.calls.length);
        } finally {
          spy.mockRestore();
        }
      }
      return {
        samples,
        counts,
        median: [...samples].sort((a, b) => a - b)[1]!,
      };
    };
    const legacy = await measure(oracle);
    const bulk = await measure(live);
    console.log("TASK14_BENCHMARK", JSON.stringify({ legacy, bulk }));
    expect(bulk.counts.every((n) => n <= 12)).toBe(true);
    expect(bulk.median).toBeLessThan(legacy.median * 0.6);
  }, 60000);
});
