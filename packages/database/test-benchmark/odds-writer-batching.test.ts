import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { teamAliasLookupFor } from "@velyq/providers";
import type { NormalizedOdds } from "@velyq/providers";

import { createPrivilegedDatabaseClient } from "../src/client.js";
import {
  ingestFootballFixture,
  loadCompetitionBridge,
} from "../src/repositories/fixture-ingestion.js";
import {
  ensureFootballReferenceData,
  ingestFootballOdds,
} from "../src/repositories/odds-ingestion.js";
import {
  legacyEnsureFootballReferenceData,
  legacyIngestFootballOdds,
} from "./odds-ingestion-legacy.js";
import { competitionIdentities, competitions } from "../src/schema/catalog.js";

/**
 * Odds-writer cost, measured rather than asserted from the shape of the code.
 *
 * The previous writer's problem was not CPU: it was a sequential chain of
 * database round trips, one transaction per observation, inside a serverless
 * invocation with a hard wall-clock limit. That cost -- about twelve seconds
 * per fixture -- is why the bookmaker panel was capped at six, and why wiring
 * a second market would have doubled the binding constraint.
 *
 * `odds-ingestion-legacy.ts` is the previous implementation, kept solely so
 * this comparison is a real before/after against the same PostgreSQL instance
 * on the same batch, and so a future change that reintroduces per-observation
 * writes fails here instead of being discovered in production.
 *
 * Round trips are counted by wrapping BOTH `pool.query` and the client that
 * `pool.connect()` hands back. Wrapping only `pool.query` counts far too few:
 * a Drizzle transaction checks out a dedicated client and issues every
 * statement -- including BEGIN and COMMIT -- through that, so per-observation
 * transactions would be almost entirely invisible and the comparison would
 * flatter the old writer rather than the new one.
 */

const DATABASE_URL =
  process.env["DATABASE_URL"] ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const client = createPrivilegedDatabaseClient({
  connectionString: DATABASE_URL,
});
const database = client.database;

const PROVIDER_CODE = "API_SPORTS";

/** Six bookmakers: the panel size the old cap was chosen to fit. */
const BOOKMAKERS = [
  "Bench Book A",
  "Bench Book B",
  "Bench Book C",
  "Bench Book D",
  "Bench Book E",
  "Bench Book F",
];

const OBSERVED_AT = "2026-09-20T10:00:00.000Z";

function observations(
  providerEventId: string,
  options: Readonly<{ totals: boolean }>,
): readonly NormalizedOdds[] {
  const rows: NormalizedOdds[] = [];
  for (const bookmaker of BOOKMAKERS) {
    for (const [selection, odds] of [
      ["Home", "2.10"],
      ["Draw", "3.40"],
      ["Away", "3.60"],
    ] as const) {
      rows.push({
        sport: "FOOTBALL",
        providerEventId,
        bookmaker,
        providerMarket: "1",
        canonicalMarket: "MATCH_WINNER_1X2",
        selection,
        decimalOdds: odds as NormalizedOdds["decimalOdds"],
        providerObservedAt: OBSERVED_AT,
        ingestedAt: OBSERVED_AT,
        provider: "API_SPORTS",
        sourceReference: "benchmark",
      });
    }
    if (!options.totals) continue;
    for (const [selection, odds] of [
      ["OVER", "1.95"],
      ["UNDER", "1.90"],
    ] as const) {
      rows.push({
        sport: "FOOTBALL",
        providerEventId,
        bookmaker,
        providerMarket: "5",
        canonicalMarket: "TOTAL_GOALS",
        selection,
        line: "2.5",
        decimalOdds: odds as NormalizedOdds["decimalOdds"],
        providerObservedAt: OBSERVED_AT,
        ingestedAt: OBSERVED_AT,
        provider: "API_SPORTS",
        sourceReference: "benchmark",
      });
    }
  }
  return rows;
}

type Reference = Awaited<ReturnType<typeof ensureFootballReferenceData>>;

async function seedFixture(
  providerFixtureId: string,
  reference: Reference,
): Promise<void> {
  const suffix = randomUUID().slice(0, 8);
  const [competition] = await database
    .insert(competitions)
    .values({
      sportId: reference.sportId,
      code: `BENCH_${suffix}`,
      nameKey: "competition.bench",
      countryCode: "GB",
    })
    .returning({ id: competitions.id });
  await database.insert(competitionIdentities).values({
    competitionId: competition!.id,
    providerId: reference.providerId,
    providerCompetitionId: `bench-${suffix}`,
    displayName: "Benchmark League",
    countryCode: "GB",
    mappingStatus: "CONFIRMED",
  });
  const bridge = await loadCompetitionBridge(database, reference.providerId);
  const ingested = await ingestFootballFixture(database, {
    providerId: reference.providerId,
    providerCode: PROVIDER_CODE,
    sportId: reference.sportId,
    event: {
      sport: "FOOTBALL",
      providerEventId: providerFixtureId,
      competition: "Benchmark League",
      competitionProviderId: `bench-${suffix}`,
      competitionCountry: "England",
      competitionCountryCode: "GB",
      season: 2026,
      participants: [`Bench United ${suffix}`, `Bench City ${suffix}`],
      scheduledAt: "2026-09-25T18:00:00.000Z",
      status: "NS",
      provider: "API_SPORTS",
      sourceReference: "benchmark",
    },
    competitionBridge: bridge,
    teamAliasLookup: teamAliasLookupFor,
  });
  if (!ingested.ok) throw new Error(`fixture seed failed: ${ingested.reason}`);
}

type Measurement = Readonly<{
  roundTrips: number;
  elapsedMs: number;
  written: number;
  observations: number;
}>;

let roundTrips = 0;
const originalQuery = client.pool.query.bind(client.pool);
const originalConnect = client.pool.connect.bind(client.pool);

async function measure(
  observationCount: number,
  run: () => Promise<readonly { ok: boolean; duplicate?: boolean }[]>,
): Promise<Measurement> {
  roundTrips = 0;
  const startedAt = process.hrtime.bigint();
  const results = await run();
  const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
  return {
    roundTrips,
    elapsedMs,
    written: results.filter((row) => row.ok && row.duplicate === false).length,
    observations: observationCount,
  };
}

describe("odds writer batching, against a real database", () => {
  let reference: Reference;
  let legacyReference: Awaited<
    ReturnType<typeof legacyEnsureFootballReferenceData>
  >;
  let legacy: Measurement;
  let batched: Measurement;
  let bothMarkets: Measurement;
  let observationCount = 0;

  beforeAll(async () => {
    reference = await ensureFootballReferenceData(database, PROVIDER_CODE);
    legacyReference = await legacyEnsureFootballReferenceData(
      database,
      PROVIDER_CODE,
    );

    /* Separate fixtures per run, so neither sees the other's rows as
       duplicates -- a duplicate short-circuits the write and would flatter
       whichever ran second. */
    await seedFixture("990001", reference);
    await seedFixture("990002", reference);
    await seedFixture("990003", reference);

    /* eslint-disable @typescript-eslint/no-explicit-any -- counting wrappers */
    (client.pool as any).query = (...args: unknown[]) => {
      roundTrips += 1;
      return (originalQuery as any)(...args);
    };
    /*
     * `pool.connect()` has a promise form and a callback form, and pg uses
     * both internally. Wrapping only the promise form left the callback path
     * awaiting an undefined client and produced twenty-three unhandled
     * rejections, so both are handled here.
     */
    const countConnection = (connection: any): any => {
      /*
       * Wrapped once per physical connection. `connect()` hands back a
       * pooled client, so wrapping on every checkout layers a counter over
       * the previous one and each statement is counted once per layer --
       * which is how an 18-observation batch first measured 1824 round
       * trips.
       */
      if (connection && !connection.__velyqCounted) {
        connection.__velyqCounted = true;
        const connectionQuery = connection.query.bind(connection);
        connection.query = (...inner: unknown[]) => {
          roundTrips += 1;
          return connectionQuery(...inner);
        };
      }
      return connection;
    };
    (client.pool as any).connect = (...args: unknown[]) => {
      const callback = args[0];
      if (typeof callback === "function") {
        return (originalConnect as any)(
          (error: unknown, connection: any, release: unknown) =>
            callback(error, countConnection(connection), release),
        );
      }
      return (originalConnect as any)().then(countConnection);
    };
    /* eslint-enable @typescript-eslint/no-explicit-any */

    /*
     * 1X2 only for the comparison: the exact workload the previous writer
     * actually carried, so the result is like for like rather than flattered
     * by the second market.
     */
    const oneMarket = observations("990001", { totals: false });
    observationCount = oneMarket.length;
    legacy = await measure(oneMarket.length, () =>
      legacyIngestFootballOdds(database, oneMarket, legacyReference),
    );
    const batchedRows = observations("990002", { totals: false });
    batched = await measure(batchedRows.length, () =>
      ingestFootballOdds(database, batchedRows, reference),
    );
    const bothRows = observations("990003", { totals: true });
    bothMarkets = await measure(bothRows.length, () =>
      ingestFootballOdds(database, bothRows, reference),
    );

    /*
     * Written to a file rather than logged. Vitest's reporter swallows
     * console output from hooks, and a measurement nobody can read is not a
     * measurement -- the release documentation quotes these numbers.
     */
    const measured = {
      observations: observationCount,
      bookmakers: BOOKMAKERS.length,
      perObservation: {
        roundTrips: legacy.roundTrips,
        elapsedMs: Math.round(legacy.elapsedMs),
      },
      batched: {
        roundTrips: batched.roundTrips,
        elapsedMs: Math.round(batched.elapsedMs),
      },
      batchedBothMarkets: {
        observations: bothMarkets.observations,
        roundTrips: bothMarkets.roundTrips,
        elapsedMs: Math.round(bothMarkets.elapsedMs),
      },
    };
    writeFileSync(
      process.env["VELYQ_BENCHMARK_OUT"] ??
        join(tmpdir(), "velyq-odds-writer-benchmark.json"),
      `${JSON.stringify(measured, null, 2)}
`,
      "utf8",
    );
  }, 120_000);

  afterAll(async () => {
    /* eslint-disable @typescript-eslint/no-explicit-any -- restore */
    (client.pool as any).query = originalQuery;
    (client.pool as any).connect = originalConnect;
    /* eslint-enable @typescript-eslint/no-explicit-any */
    await client.close();
  });

  /* The comparison is only meaningful if both wrote the same thing. */
  it("writes identically either way", () => {
    expect(batched.written).toBe(legacy.written);
    expect(batched.written).toBe(observationCount);
  });

  /*
   * The headline claim. Per observation the old writer needed roughly seven
   * to ten statements; batched, the whole batch needs a couple of dozen.
   */
  it("uses far fewer round trips than one transaction per observation", () => {
    expect(batched.roundTrips).toBeLessThan(legacy.roundTrips / 4);
  });

  it("no longer scales round trips with the number of observations", () => {
    /*
     * Stated as the property that actually holds, rather than as a count.
     *
     * The batched writer's statements are bounded by distinct bookmakers,
     * markets and outcomes plus a small constant -- not by observations. So
     * the honest test is that adding twelve more observations (the second
     * market, same six bookmakers) costs only a few more statements, where
     * the old writer would have cost about eleven each.
     *
     * The measured figures at the time of writing: 18 observations took 206
     * statements per-observation and 24 batched; 30 observations took 27
     * batched.
     */
    const extraObservations = bothMarkets.observations - observationCount;
    const extraRoundTrips = bothMarkets.roundTrips - batched.roundTrips;
    expect(extraObservations).toBeGreaterThan(0);
    expect(extraRoundTrips).toBeLessThan(extraObservations);
  });

  /*
   * This is what makes the second market affordable: adding Over/Under costs
   * a few more statements, not another full pass.
   */
  it("absorbs a second market without a second market's worth of cost", () => {
    expect(bothMarkets.roundTrips).toBeLessThan(legacy.roundTrips / 3);
  });

  it("is faster in wall clock, which is the invocation's real limit", () => {
    expect(batched.elapsedMs).toBeLessThan(legacy.elapsedMs);
  });
});
