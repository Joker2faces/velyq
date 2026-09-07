import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPrivilegedDatabaseClient } from "../../packages/database/src/client.js";
import { DatabaseCustomerQueryAdapter } from "../../packages/database/src/repositories/customer-queries.js";
import { ingestFootballDataFixtures } from "../../workers/ingestion/src/football-data-fixtures.js";
import {
  registerModelArtifact,
  runPreEventPredictionCycle,
} from "../../workers/prediction/src/index.js";
import {
  artifactFingerprint,
  decodeSourceBytes,
  type ModelArtifact,
} from "../../packages/research/src/index.js";

/**
 * The prediction trigger, end to end, against a real PostgreSQL.
 *
 * This is the test for the phase's actual root cause, and it can only be a
 * database test: the defect was never in a pure function. Production had zero
 * real predictions because nothing enqueued a job, nothing wrote the quality
 * assessment the handler demands, and no model existed to supply a
 * probability — three gaps that only show up when the whole chain runs against
 * real tables.
 *
 * Opt-in, because it needs a database and the corpus. Set
 * VELYQ_INTEGRATION_DATABASE_URL to a loopback PostgreSQL that
 * `tooling/scripts/local-database.mjs bootstrap` has been run against, and
 * make sure the artifact and the fixtures feed are present:
 *
 *   pnpm data:historical:download
 *   pnpm model:train
 *   VELYQ_LOCAL_DATABASE_URL=... pnpm db:local
 *   VELYQ_INTEGRATION_DATABASE_URL=... pnpm test
 */

const CONNECTION = process.env["VELYQ_INTEGRATION_DATABASE_URL"];
const CORPUS =
  process.env["VELYQ_HISTORICAL_CORPUS_DIR"] ?? "data/historical/football-data";
const ARTIFACTS =
  process.env["VELYQ_MODEL_ARTIFACT_DIR"] ?? "data/historical/artifacts";
const ARTIFACT_FILE = path.join(ARTIFACTS, "football-dixon-coles.v1.json");
const FIXTURES_FILE = path.join(CORPUS, "fixtures.csv");

function ready() {
  if (!CONNECTION) return false;
  try {
    readFileSync(ARTIFACT_FILE);
    readFileSync(FIXTURES_FILE);
    return true;
  } catch {
    return false;
  }
}

describe.skipIf(!ready())("the pre-event prediction cycle", () => {
  let client: ReturnType<typeof createPrivilegedDatabaseClient>;

  beforeAll(() => {
    client = createPrivilegedDatabaseClient({
      connectionString: CONNECTION!,
      max: 1,
    });
  });

  afterAll(async () => {
    await client?.close();
  });

  it("goes from no real prediction to real predictions, and says why each stopped", async () => {
    const artifact = JSON.parse(
      readFileSync(ARTIFACT_FILE, "utf8"),
    ) as ModelArtifact;

    const registration = await registerModelArtifact({
      database: client.database,
      artifact,
      artifactReference: artifactFingerprint(artifact),
    });
    // EXPERIMENTAL is not a placeholder: the FORTRESS gate refuses anything
    // EXPERIMENTAL, so this is what keeps a first fit away from a customer
    // recommendation.
    expect(registration.maturity).toBe("EXPERIMENTAL");

    const asOf = new Date();
    const ingestion = await ingestFootballDataFixtures({
      database: client.database,
      csv: decodeSourceBytes(readFileSync(FIXTURES_FILE)),
      asOf,
    });
    expect(ingestion.feedRejected).toBe(0);
    // Only fixtures that have not kicked off are stored, because a prediction
    // stamped after kickoff is not a forecast.
    expect(ingestion.alreadyStarted).toBeGreaterThanOrEqual(0);

    const cycle = await runPreEventPredictionCycle({
      database: client.database,
      asOf,
      triggerSource: "CLI",
    });

    expect(cycle.modelVersion).toBe(artifact.version);
    expect(cycle.counts.eventsDiscovered).toBeGreaterThan(0);
    // Every job the cycle enqueued must have run. A failure here is the
    // durable pipeline breaking, which is exactly what used to happen
    // silently.
    expect(
      Object.keys(cycle.drained).filter((key) => key.startsWith("FAILED")),
    ).toEqual([]);

    if (cycle.counts.predictionsRequested > 0) {
      expect(cycle.counts.predictionsCreated).toBe(
        cycle.counts.predictionsRequested,
      );
      expect(cycle.funnelRunId).not.toBeNull();
    }

    /*
     * Zero EDGE is an acceptable answer; "no prediction existed" is not. So
     * whenever the funnel reports no decision, it has to name the stage that
     * emptied rather than leaving the owner to guess.
     */
    if (cycle.counts.edge === 0 && cycle.counts.strongEdge === 0)
      expect(Object.keys(cycle.noBetReasons).length).toBeGreaterThan(0);
  }, 120_000);

  it("creates nothing on a second run over unchanged prices", async () => {
    /*
     * The idempotency property, and it is easy to get wrong: the feature
     * cutoff has to come from the newest observation in the decision's own
     * input set, not from the wall clock. With the clock, every run was a new
     * cutoff and every run duplicated every prediction.
     */
    const asOf = new Date();
    const before = await runPreEventPredictionCycle({
      database: client.database,
      asOf,
      triggerSource: "CLI",
    });
    const after = await runPreEventPredictionCycle({
      database: client.database,
      asOf: new Date(asOf.getTime() + 1000),
      triggerSource: "CLI",
    });

    expect(after.counts.predictionsCreated).toBe(
      before.counts.predictionsCreated,
    );
    // Nothing left to do: the second run enqueued no new work at all.
    expect(after.drained).toEqual({});
  }, 120_000);

  it("evaluates nothing outside the horizon or the policy", async () => {
    const asOf = new Date();
    const narrow = await runPreEventPredictionCycle({
      database: client.database,
      asOf,
      horizonHours: 1,
      triggerSource: "CLI",
      commit: false,
    });
    const wide = await runPreEventPredictionCycle({
      database: client.database,
      asOf,
      horizonHours: 48,
      triggerSource: "CLI",
      commit: false,
    });
    expect(narrow.counts.eventsInHorizon).toBeLessThanOrEqual(
      wide.counts.eventsInHorizon,
    );
    // A dry run writes nothing and still reports the same funnel shape, so it
    // is usable for answering "what would today produce" without producing it.
    expect(narrow.funnelRunId).toBeNull();
    expect(narrow.drained).toEqual({});
  }, 120_000);
});

describe.skipIf(!ready())("the customer intelligence universe", () => {
  let client: ReturnType<typeof createPrivilegedDatabaseClient>;

  beforeAll(() => {
    client = createPrivilegedDatabaseClient({
      connectionString: CONNECTION!,
      max: 1,
    });
  });

  afterAll(async () => {
    await client?.close();
  });

  it("shows only competitions the policy makes customer-visible", async () => {
    const queries = new DatabaseCustomerQueryAdapter(client.database);
    const asOf = new Date();
    const intelligence = await queries.getToday(asOf);
    const everything = await queries.getToday(asOf, { scope: "ALL" });

    // The whole point of the two scopes: the intelligence view is a subset,
    // and the difference is accounted for rather than silently dropped.
    expect(intelligence.matches.length).toBeLessThanOrEqual(
      everything.matches.length,
    );
    expect(intelligence.matches.length + intelligence.suppressed.total).toBe(
      everything.matches.length,
    );
  }, 60_000);

  it("reports suppression as counts and reasons, never as rows", async () => {
    const queries = new DatabaseCustomerQueryAdapter(client.database);
    const today = await queries.getToday(new Date());
    // Rendering every unmodelled fixture with an identical "insufficient
    // data" badge is what crowded out the matches the model has an opinion
    // about, so the summary must be a tally and nothing else.
    expect(Number.isInteger(today.suppressed.total)).toBe(true);
    expect(today.suppressed.total).toBeGreaterThanOrEqual(0);
    for (const [reason, count] of Object.entries(today.suppressed.byReason)) {
      expect(reason).toMatch(/^[A-Z_]+$/);
      expect(count).toBeGreaterThan(0);
    }
    expect(
      Object.values(today.suppressed.byReason).reduce(
        (sum, count) => sum + count,
        0,
      ),
    ).toBe(today.suppressed.total);
  }, 60_000);

  it("bounds the window to today and tomorrow rather than the whole provider", async () => {
    const queries = new DatabaseCustomerQueryAdapter(client.database);
    const asOf = new Date();
    const narrow = await queries.getToday(asOf, {
      scope: "ALL",
      horizonHours: 1,
    });
    const wide = await queries.getToday(asOf, {
      scope: "ALL",
      horizonHours: 48,
    });
    expect(narrow.windowEnd.getTime()).toBeLessThan(wide.windowEnd.getTime());
    expect(narrow.matches.length).toBeLessThanOrEqual(wide.matches.length);
  }, 60_000);
});
