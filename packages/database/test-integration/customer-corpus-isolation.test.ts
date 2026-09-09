import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { NormalizedEvent } from "@velyq/providers";
import { teamAliasLookupFor } from "@velyq/providers";

import { createPrivilegedDatabaseClient } from "../src/client.js";
import { DatabaseCustomerQueryAdapter } from "../src/repositories/customer-queries.js";
import {
  ingestFootballFixture,
  loadCompetitionBridge,
} from "../src/repositories/fixture-ingestion.js";
import { ensureFootballReferenceData } from "../src/repositories/odds-ingestion.js";
import {
  competitionIdentities,
  competitions,
  events,
} from "../src/schema/catalog.js";

/*
 * A real-Postgres integration suite -- see
 * tooling/vitest/vitest.db-integration.config.mts for why this lives outside
 * the default test glob. DATABASE_URL must point at an ephemeral database;
 * this file never runs against, and never assumes, production.
 *
 * The invariant under test is a query predicate, so it cannot be proven with
 * a stubbed database: a fake would only assert that the code passes the
 * condition it passes. What matters is that Postgres, given both a live and
 * a synthetic fixture in the same UTC day, hands each corpus back only its
 * own rows.
 */
const DATABASE_URL =
  process.env["DATABASE_URL"] ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const client = createPrivilegedDatabaseClient({
  connectionString: DATABASE_URL,
});
const database = client.database;

const PROVIDER_CODE = "API_SPORTS";
const COMPETITION_CODE = "customer-corpus-isolation-league";
/* A day far enough out that no other suite's fixtures share it. */
const KICKOFF = "2027-04-18T18:00:00.000Z";
const AS_OF = new Date("2027-04-18T09:00:00.000Z");

describe("customer read corpus isolation, against a real database", () => {
  afterAll(async () => {
    await client.close();
  });

  it("serves a LIVE read only real fixtures, and never a synthetic one sharing the same day", async () => {
    const referenceData = await ensureFootballReferenceData(
      database,
      PROVIDER_CODE,
    );

    const [inserted] = await database
      .insert(competitions)
      .values({
        sportId: referenceData.sportId,
        code: COMPETITION_CODE,
        nameKey: "competition.customer_corpus_isolation",
        countryCode: "GR",
      })
      .onConflictDoNothing({
        target: [competitions.sportId, competitions.code],
      })
      .returning({ id: competitions.id });
    const competitionId =
      inserted?.id ??
      (
        await database
          .select({ id: competitions.id })
          .from(competitions)
          .where(eq(competitions.code, COMPETITION_CODE))
          .limit(1)
      )[0]!.id;

    await database
      .insert(competitionIdentities)
      .values({
        competitionId,
        providerId: referenceData.providerId,
        providerCompetitionId: "9490000",
        displayName: "Customer Corpus Isolation League",
        countryCode: "GR",
        mappingStatus: "CONFIRMED",
      })
      .onConflictDoNothing();

    const liveFixture: NormalizedEvent = {
      sport: "FOOTBALL",
      providerEventId: "94900001",
      competition: "Customer Corpus Isolation League",
      competitionProviderId: "9490000",
      competitionCountry: "Greece",
      competitionCountryCode: "GR",
      season: 2027,
      participants: ["Corpus Home FC", "Corpus Away FC"],
      scheduledAt: KICKOFF,
      status: "NS",
      provider: PROVIDER_CODE,
      sourceReference: "customer-corpus-isolation-test",
    };

    /*
     * Ingested through the real writer rather than inserted directly, because
     * a LIVE event is required to carry provider provenance before its
     * transaction commits (`events_provenance_required`) -- a hand-inserted
     * live row would be rejected, which is itself the invariant working.
     */
    const ingested = await ingestFootballFixture(database, {
      providerId: referenceData.providerId,
      providerCode: PROVIDER_CODE,
      sportId: referenceData.sportId,
      event: liveFixture,
      competitionBridge: await loadCompetitionBridge(
        database,
        referenceData.providerId,
      ),
      teamAliasLookup: teamAliasLookupFor,
    });
    if (!ingested.ok)
      throw new Error(`live fixture setup failed: ${ingested.reason}`);
    const liveEventId = ingested.eventId;

    /*
     * A synthetic row needs no provenance, so it goes in directly -- this is
     * exactly the shape of the two synthetic events that exist in the real
     * production catalog today.
     */
    const [synthetic] = await database
      .insert(events)
      .values({
        sportId: referenceData.sportId,
        competitionId,
        seasonLabel: "2027",
        startsAt: new Date(KICKOFF),
        status: "SCHEDULED",
        synthetic: true,
      })
      .returning({ id: events.id });
    const syntheticId = synthetic!.id;

    const liveReader = new DatabaseCustomerQueryAdapter(database, {
      dataOrigin: "LIVE",
    });
    const demoReader = new DatabaseCustomerQueryAdapter(database, {
      dataOrigin: "SYNTHETIC_DEMO",
    });

    const liveToday = await liveReader.getToday(AS_OF);
    const liveIds = liveToday.matches.map((match) => match.event.id);
    expect(liveIds).toContain(liveEventId);
    expect(liveIds).not.toContain(syntheticId);
    expect(liveToday.matches.every((match) => !match.event.synthetic)).toBe(
      true,
    );

    /* Hiding it from the list is not enough if its own URL still resolves. */
    expect(await liveReader.getMatch(syntheticId, AS_OF)).toBeNull();

    /*
     * The inverse, so the assertions above cannot pass merely because the
     * synthetic row was never visible to anything.
     */
    const demoToday = await demoReader.getToday(AS_OF);
    const demoIds = demoToday.matches.map((match) => match.event.id);
    expect(demoIds).toContain(syntheticId);
    expect(demoIds).not.toContain(liveEventId);
    expect(await demoReader.getMatch(liveEventId, AS_OF)).toBeNull();
  });
});
