import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  STARTING_ELEVEN,
  normalizeFootballLineup,
  teamAliasLookupFor,
} from "@velyq/providers";

import { createPrivilegedDatabaseClient } from "../src/client.js";
import {
  ingestFootballFixture,
  loadCompetitionBridge,
} from "../src/repositories/fixture-ingestion.js";
import { ingestFootballLineups } from "../src/repositories/lineup-ingestion.js";
import { ensureFootballReferenceData } from "../src/repositories/odds-ingestion.js";
import { competitionIdentities, competitions } from "../src/schema/catalog.js";
import { lineupObservations } from "../src/schema/intelligence.js";

/**
 * Lineup ingestion against real PostgreSQL.
 *
 * The unit tests prove the status mapping. What only a database can prove is
 * the part in between: that a sheet is attributed to the right side of the
 * right fixture, that a changed sheet becomes a second observation rather than
 * overwriting the first, and that a sheet for a team not on the fixture is
 * refused rather than attached to a guess.
 */

const DATABASE_URL =
  process.env["DATABASE_URL"] ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const client = createPrivilegedDatabaseClient({
  connectionString: DATABASE_URL,
});
const database = client.database;

const PROVIDER_CODE = "API_SPORTS";
const PROVIDER_FIXTURE_ID = "970001";

function playerRows(count: number, offset = 0) {
  return Array.from({ length: count }, (_, index) => ({
    player: {
      id: 5000 + offset + index,
      name: `Player ${offset + index + 1}`,
      number: index + 1,
      pos: index === 0 ? "G" : "M",
    },
  }));
}

describe("lineup ingestion, against a real database", () => {
  let reference: Awaited<ReturnType<typeof ensureFootballReferenceData>>;
  let eventId: string;
  let homeName = "";
  let awayName = "";

  beforeAll(async () => {
    reference = await ensureFootballReferenceData(database, PROVIDER_CODE);
    const suffix = randomUUID().slice(0, 8);
    homeName = `Lineup United ${suffix}`;
    awayName = `Lineup City ${suffix}`;

    const [competition] = await database
      .insert(competitions)
      .values({
        sportId: reference.sportId,
        code: `LINEUP_${suffix}`,
        nameKey: "competition.lineup_test",
        countryCode: "GB",
      })
      .returning({ id: competitions.id });
    await database.insert(competitionIdentities).values({
      competitionId: competition!.id,
      providerId: reference.providerId,
      providerCompetitionId: `lineup-${suffix}`,
      displayName: "Lineup League",
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
        providerEventId: PROVIDER_FIXTURE_ID,
        competition: "Lineup League",
        competitionProviderId: `lineup-${suffix}`,
        competitionCountry: "England",
        competitionCountryCode: "GB",
        season: 2026,
        participants: [homeName, awayName],
        scheduledAt: "2026-09-26T18:00:00.000Z",
        status: "NS",
        provider: "API_SPORTS",
        sourceReference: "test",
      },
      competitionBridge: bridge,
      teamAliasLookup: teamAliasLookupFor,
    });
    if (!ingested.ok)
      throw new Error(`fixture setup failed: ${ingested.reason}`);
    eventId = ingested.eventId;
  });

  afterAll(async () => {
    await client.close();
  });

  function lineup(
    teamName: string,
    options: Readonly<{
      players?: number;
      formation?: string;
      observedAt?: string;
      offset?: number;
      teamId?: number;
    }> = {},
  ) {
    return normalizeFootballLineup(
      {
        team: { id: options.teamId ?? 601, name: teamName },
        formation: options.formation ?? "4-3-3",
        startXI: playerRows(options.players ?? STARTING_ELEVEN, options.offset),
        substitutes: playerRows(7, 900),
      },
      PROVIDER_FIXTURE_ID,
      options.observedAt ?? "2026-09-26T17:00:00.000Z",
    );
  }

  it("attributes each sheet to the right side of the fixture", async () => {
    const summary = await ingestFootballLineups(database, {
      providerId: reference.providerId,
      lineups: [
        lineup(homeName, { teamId: 601 }),
        lineup(awayName, { teamId: 602, offset: 100 }),
      ],
      policyVersionId: reference.policyVersionId,
    });

    expect(summary.received).toBe(2);
    expect(summary.written).toBe(2);
    /* Both sheets complete, so the fixture is answered and the gate can
       clear -- counted once for the fixture, not once per team. */
    expect(summary.official).toBe(1);
    expect(summary.statusByProviderFixtureId[PROVIDER_FIXTURE_ID]).toBe(
      "OFFICIAL",
    );

    const stored = await database
      .select({
        teamParticipantId: lineupObservations.teamParticipantId,
        status: lineupObservations.status,
        formation: lineupObservations.formation,
      })
      .from(lineupObservations)
      .where(eq(lineupObservations.eventId, eventId));

    expect(stored).toHaveLength(2);
    /* Two distinct teams, not the same one twice -- which is what a name
       match across the whole participant table could have produced. */
    expect(new Set(stored.map((row) => row.teamParticipantId)).size).toBe(2);
    for (const row of stored) {
      expect(row.status).toBe("OFFICIAL");
      expect(row.formation).toBe("4-3-3");
    }
  });

  /*
   * Idempotency. A re-reported identical sheet is one observation, so a
   * fixture asked about twice in the window does not accumulate duplicates.
   */
  it("writes nothing when the identical sheet is reported again", async () => {
    const payload = [lineup(homeName, { teamId: 601 })];
    const again = await ingestFootballLineups(database, {
      providerId: reference.providerId,
      lineups: payload,
      policyVersionId: reference.policyVersionId,
    });
    expect(again.written).toBe(0);
    expect(again.duplicate).toBe(1);
  });

  /*
   * A changed sheet is a NEW observation, never an overwrite. This is what
   * makes "the lineup changed" derivable rather than a guess, and it is the
   * before/after the evidence timeline and the autopsy both read.
   */
  it("records a changed sheet without rewriting the first", async () => {
    const changed = await ingestFootballLineups(database, {
      providerId: reference.providerId,
      lineups: [
        lineup(homeName, {
          teamId: 601,
          formation: "3-5-2",
          observedAt: "2026-09-26T17:30:00.000Z",
        }),
      ],
      policyVersionId: reference.policyVersionId,
    });
    expect(changed.written).toBe(1);
    expect(changed.duplicate).toBe(0);

    const formations = await database
      .select({ formation: lineupObservations.formation })
      .from(lineupObservations)
      .where(eq(lineupObservations.eventId, eventId));

    const values = formations.map((row) => row.formation);
    expect(values).toContain("4-3-3");
    expect(values).toContain("3-5-2");
  });

  /*
   * The failure that matters most: a sheet for a team not on this fixture.
   * Attaching it would invert the home/away reading of the whole match, so it
   * is refused and named rather than guessed at.
   */
  it("refuses a sheet whose team is not on the fixture", async () => {
    const summary = await ingestFootballLineups(database, {
      providerId: reference.providerId,
      lineups: [lineup("Some Other Club Entirely", { teamId: 999 })],
      policyVersionId: reference.policyVersionId,
    });
    expect(summary.written).toBe(0);
    expect(summary.skippedByReason["LINEUP_TEAM_NOT_ON_FIXTURE"]).toBe(1);
  });

  it("refuses a sheet for a fixture we do not have", async () => {
    const orphan = normalizeFootballLineup(
      {
        team: { id: 601, name: homeName },
        formation: "4-3-3",
        startXI: playerRows(STARTING_ELEVEN),
      },
      "999999",
      "2026-09-26T17:00:00.000Z",
    );
    const summary = await ingestFootballLineups(database, {
      providerId: reference.providerId,
      lineups: [orphan],
      policyVersionId: reference.policyVersionId,
    });
    expect(summary.written).toBe(0);
    expect(summary.skippedByReason["LINEUP_EVENT_IDENTITY_NOT_FOUND"]).toBe(1);
  });

  /*
   * A partial sheet must not report the fixture as answered, because
   * WAIT_FOR_LINEUP would then clear on a provisional eleven.
   */
  it("does not report a fixture official on a partial sheet", async () => {
    const summary = await ingestFootballLineups(database, {
      providerId: reference.providerId,
      lineups: [
        lineup(homeName, {
          teamId: 601,
          players: STARTING_ELEVEN - 2,
          observedAt: "2026-09-26T16:00:00.000Z",
          offset: 300,
        }),
      ],
      policyVersionId: reference.policyVersionId,
    });
    expect(summary.written).toBe(1);
    expect(summary.official).toBe(0);
    expect(summary.statusByProviderFixtureId[PROVIDER_FIXTURE_ID]).toBe(
      "EXPECTED",
    );
  });

  /*
   * One team confirmed and the other provisional is NOT an answered fixture.
   * Reporting OFFICIAL here would stop the scheduler asking for the half that
   * is still missing.
   */
  it("reports the weakest sheet when only one team is confirmed", async () => {
    const summary = await ingestFootballLineups(database, {
      providerId: reference.providerId,
      lineups: [
        lineup(homeName, {
          teamId: 601,
          observedAt: "2026-09-26T15:00:00.000Z",
          offset: 400,
        }),
        lineup(awayName, {
          teamId: 602,
          players: STARTING_ELEVEN - 3,
          observedAt: "2026-09-26T15:00:00.000Z",
          offset: 500,
        }),
      ],
      policyVersionId: reference.policyVersionId,
    });
    expect(summary.written).toBe(2);
    expect(summary.official).toBe(0);
    expect(summary.statusByProviderFixtureId[PROVIDER_FIXTURE_ID]).toBe(
      "EXPECTED",
    );
  });

  it("stores no confidence value", async () => {
    const rows = await database
      .select({ confidence: lineupObservations.confidence })
      .from(lineupObservations)
      .where(
        and(
          eq(lineupObservations.eventId, eventId),
          eq(lineupObservations.status, "OFFICIAL"),
        ),
      );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.confidence).toBeNull();
    }
  });
});
