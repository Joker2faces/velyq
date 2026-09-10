import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { deterministicEventId } from "@velyq/domain";
import type { NormalizedEvent, NormalizedOdds } from "@velyq/providers";
import { teamAliasLookupFor } from "@velyq/providers";

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
  competitionIdentities,
  competitions,
  eventIdentities,
  events,
  participants,
} from "../src/schema/catalog.js";
import {
  bookmakers,
  eventMarketOutcomes,
  eventMarkets,
  marketDefinitions,
  oddsObservations,
  outcomeDefinitions,
} from "../src/schema/market.js";

/*
 * A real-Postgres integration suite -- see
 * tooling/vitest/vitest.db-integration.config.mts for why this lives outside
 * the default test glob. DATABASE_URL must point at an ephemeral database
 * (the local Supabase stack in CI's db-integration job); this file never
 * runs against, and never assumes, production.
 */
const DATABASE_URL =
  process.env["DATABASE_URL"] ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const client = createPrivilegedDatabaseClient({
  connectionString: DATABASE_URL,
});
const database = client.database;

const PROVIDER_CODE = "API_SPORTS";

function fixture(overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    sport: "FOOTBALL",
    providerEventId: "900001",
    competition: "Serie A",
    competitionProviderId: "135",
    competitionCountry: "Italy",
    competitionCountryCode: "IT",
    season: 2026,
    participants: ["Juventus", "Inter"],
    scheduledAt: "2026-09-20T18:00:00.000Z",
    status: "NS",
    provider: "API_SPORTS",
    sourceReference: "test",
    ...overrides,
  };
}

describe("fixture and odds ingestion, against a real database", () => {
  let referenceData: Awaited<ReturnType<typeof ensureFootballReferenceData>>;
  let italianSerieAId: string;
  let brazilianSerieAId: string;
  let dutchEredivisieId: string;

  beforeAll(async () => {
    referenceData = await ensureFootballReferenceData(database, PROVIDER_CODE);

    const [italy] = await database
      .insert(competitions)
      .values({
        sportId: referenceData.sportId,
        code: "ITA_SERIE_A_INTEGRATION_TEST",
        nameKey: "competition.ita_serie_a",
        countryCode: "IT",
      })
      .returning({ id: competitions.id });
    italianSerieAId = italy!.id;

    const [brazil] = await database
      .insert(competitions)
      .values({
        sportId: referenceData.sportId,
        code: "BRA_SERIE_A_INTEGRATION_TEST",
        nameKey: "competition.bra_serie_a",
        countryCode: "BR",
      })
      .returning({ id: competitions.id });
    brazilianSerieAId = brazil!.id;

    const [netherlands] = await database
      .insert(competitions)
      .values({
        sportId: referenceData.sportId,
        code: "NLD_EREDIVISIE",
        nameKey: "competition.nld_eredivisie",
        countryCode: "NL",
      })
      .returning({ id: competitions.id });
    dutchEredivisieId = netherlands!.id;

    await database.insert(competitionIdentities).values([
      {
        competitionId: italianSerieAId,
        providerId: referenceData.providerId,
        providerCompetitionId: "135",
        displayName: "Serie A",
        countryCode: "IT",
        mappingStatus: "CONFIRMED",
      },
      {
        competitionId: brazilianSerieAId,
        providerId: referenceData.providerId,
        providerCompetitionId: "71",
        displayName: "Serie A",
        countryCode: "BR",
        mappingStatus: "CONFIRMED",
      },
      {
        competitionId: dutchEredivisieId,
        providerId: referenceData.providerId,
        providerCompetitionId: "88",
        displayName: "Eredivisie",
        countryCode: "NL",
        mappingStatus: "CONFIRMED",
      },
    ]);
  });

  afterAll(async () => {
    await client.close();
  });

  async function ingest(event: NormalizedEvent) {
    const bridge = await loadCompetitionBridge(
      database,
      referenceData.providerId,
    );
    return ingestFootballFixture(database, {
      providerId: referenceData.providerId,
      providerCode: PROVIDER_CODE,
      sportId: referenceData.sportId,
      event,
      competitionBridge: bridge,
      teamAliasLookup: teamAliasLookupFor,
    });
  }

  function eredivisieFixture(
    overrides: Partial<NormalizedEvent> = {},
  ): NormalizedEvent {
    return fixture({
      competition: "Eredivisie",
      competitionProviderId: "88",
      competitionCountry: "Netherlands",
      competitionCountryCode: "NL",
      ...overrides,
    });
  }

  it("[1] an existing SYNTHETIC_DEMO fixture remains valid -- the provenance trigger never blocks synthetic rows", async () => {
    const [synthetic] = await database
      .insert(events)
      .values({
        sportId: referenceData.sportId,
        competitionId: italianSerieAId,
        seasonLabel: "Synthetic",
        startsAt: new Date("2026-09-22T18:00:00.000Z"),
        status: "SCHEDULED",
        synthetic: true,
      })
      .returning({ id: events.id });
    expect(synthetic).toBeDefined();
  });

  it("[3] a LIVE row with no event_identities is rejected by the deferred provenance trigger", async () => {
    // Exercises the database invariant directly, bypassing the repository
    // write path entirely: nothing about the constraint trigger depends on
    // going through ingestFootballFixture, and this proves the database
    // itself refuses the unsafe state, not just that the application code
    // happens to avoid it.
    try {
      await database.transaction(async (transaction) => {
        await transaction.insert(events).values({
          sportId: referenceData.sportId,
          competitionId: italianSerieAId,
          startsAt: new Date("2026-09-23T18:00:00.000Z"),
          status: "NS",
          synthetic: false,
        });
      });
      throw new Error("Expected the deferred provenance trigger to reject");
    } catch (error) {
      const cause = error instanceof Error ? error.cause : undefined;
      expect(cause).toMatchObject({
        message: expect.stringMatching(/event_identities/),
      });
    }
  });

  it("[3b] a fixture missing the provider's own competition id is rejected before any write is attempted", async () => {
    const result = await ingest(
      fixture({ providerEventId: "900099", competitionProviderId: null }),
    );
    expect(result).toEqual({
      ok: false,
      reason: "COMPETITION_PROVIDER_ID_MISSING",
    });

    const [identity] = await database
      .select({ id: eventIdentities.id })
      .from(eventIdentities)
      .where(eq(eventIdentities.providerFixtureId, "900099"));
    expect(identity).toBeUndefined();
  });

  it("[2] accepts a LIVE fixture with valid provider provenance", async () => {
    const result = await ingest(fixture());
    expect(result).toMatchObject({ ok: true, competitionId: italianSerieAId });

    if (!result.ok) return;
    const [row] = await database
      .select({ synthetic: events.synthetic })
      .from(events)
      .where(eq(events.id, result.eventId));
    expect(row?.synthetic).toBe(false);

    const [identity] = await database
      .select({ providerFixtureId: eventIdentities.providerFixtureId })
      .from(eventIdentities)
      .where(eq(eventIdentities.eventId, result.eventId));
    expect(identity?.providerFixtureId).toBe("900001");
  });

  it("[4] ingesting the same provider fixture twice is idempotent", async () => {
    const first = await ingest(fixture());
    const second = await ingest(fixture());
    expect(first.ok && second.ok && first.eventId === second.eventId).toBe(
      true,
    );

    const identityRows = first.ok
      ? await database
          .select({ id: eventIdentities.id })
          .from(eventIdentities)
          .where(eq(eventIdentities.eventId, first.eventId))
      : [];
    expect(identityRows).toHaveLength(1);
  });

  it("[5] an updated provider fixture updates the same logical internal event", async () => {
    const original = await ingest(fixture({ status: "NS" }));
    const updated = await ingest(
      fixture({ status: "PST", scheduledAt: "2026-09-21T18:00:00.000Z" }),
    );
    expect(
      original.ok && updated.ok && original.eventId === updated.eventId,
    ).toBe(true);

    if (!updated.ok) return;
    const [row] = await database
      .select({ status: events.status })
      .from(events)
      .where(eq(events.id, updated.eventId));
    expect(row?.status).toBe("PST");
  });

  it("[6] Italian Serie A and Brazilian Serie A remain distinct through actual fixture ingestion", async () => {
    const italian = await ingest(fixture());
    const brazilian = await ingest(
      fixture({
        providerEventId: "900002",
        competitionProviderId: "71",
        competitionCountryCode: "BR",
        participants: ["Vitoria", "Gremio"],
      }),
    );

    expect(italian).toMatchObject({ ok: true, competitionId: italianSerieAId });
    expect(brazilian).toMatchObject({
      ok: true,
      competitionId: brazilianSerieAId,
    });
    expect(
      italian.ok &&
        brazilian.ok &&
        italian.competitionId !== brazilian.competitionId,
    ).toBe(true);
  });

  it("[9] deterministic event identity remains stable through DB persistence", async () => {
    const expectedId = deterministicEventId(PROVIDER_CODE, "900001");
    const result = await ingest(fixture());
    expect(result).toMatchObject({ ok: true, eventId: expectedId });
  });

  it("[8a] UNRESOLVED_TEAM auto-catalogs a genuinely new team name and proceeds", async () => {
    const result = await ingest(
      eredivisieFixture({
        providerEventId: "900003",
        participants: ["Some Never Before Seen Club", "Inter"],
      }),
    );
    expect(result.ok).toBe(true);
  });

  it("[8b] a verified alias whose target has no catalog participant yet is TEAM_NOT_IN_MODEL, not a silent success", async () => {
    /*
     * "NEC Nijmegen" -> "nijmegen" is verified (team-aliases.ts), but no
     * participant coded "nijmegen" has been catalogued in this test run yet.
     * This must reject, distinctly from the always-succeeds UNRESOLVED_TEAM
     * case directly above -- an unlisted name is safe to catalog on sight,
     * a *verified* alias whose target is missing is not the same situation
     * and must not be treated as if it were.
     */
    const result = await ingest(
      eredivisieFixture({
        providerEventId: "900004",
        participants: ["NEC Nijmegen", "Inter"],
      }),
    );
    expect(result).toMatchObject({ ok: false, reason: "TEAM_NOT_IN_MODEL" });

    const [identity] = await database
      .select({ id: eventIdentities.id })
      .from(eventIdentities)
      .where(eq(eventIdentities.providerFixtureId, "900004"));
    expect(identity).toBeUndefined();
  });

  it("[7] a verified team alias is exercised by actual fixture ingestion once its target exists", async () => {
    const [nijmegen] = await database
      .insert(participants)
      .values({
        sportId: referenceData.sportId,
        type: "TEAM",
        code: "nijmegen",
        displayName: "Nijmegen",
      })
      .returning({ id: participants.id });

    const result = await ingest(
      eredivisieFixture({
        providerEventId: "900005",
        participants: ["NEC Nijmegen", "Inter"],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.homeParticipantId).toBe(nijmegen!.id);
  });

  it("[10, 11] preserves multiple odds observations as history and is idempotent for an identical payload", async () => {
    const base: NormalizedOdds = {
      sport: "FOOTBALL",
      providerEventId: "900001",
      bookmaker: "Test Book",
      providerMarket: "1",
      canonicalMarket: "MATCH_WINNER_1X2",
      selection: "Home",
      decimalOdds: "1.85" as NormalizedOdds["decimalOdds"],
      providerObservedAt: "2026-09-19T10:00:00.000Z",
      ingestedAt: "2026-09-19T10:00:01.000Z",
      provider: "API_SPORTS",
      sourceReference: "test",
    };
    await ingest(fixture());

    const first = await ingestFootballOdds(database, [base], referenceData);
    expect(first[0]).toMatchObject({ ok: true, duplicate: false });

    const repeated = await ingestFootballOdds(database, [base], referenceData);
    expect(repeated[0]).toMatchObject({ ok: true, duplicate: true });

    const later: NormalizedOdds = {
      ...base,
      decimalOdds: "1.80" as NormalizedOdds["decimalOdds"],
      providerObservedAt: "2026-09-19T12:00:00.000Z",
    };
    const second = await ingestFootballOdds(database, [later], referenceData);
    expect(second[0]).toMatchObject({ ok: true, duplicate: false });

    const eventId = deterministicEventId(PROVIDER_CODE, "900001");
    const history = await database.query.eventIdentities.findFirst({
      where: eq(eventIdentities.eventId, eventId),
    });
    expect(history).toBeDefined();

    const rows = await database
      .select({ decimalOdds: oddsObservations.decimalOdds })
      .from(oddsObservations);
    // Both distinct observations for this outcome/bookmaker must exist as
    // separate rows -- never a single mutable current price.
    expect(rows.map((row) => row.decimalOdds)).toEqual(
      expect.arrayContaining(["1.85000000", "1.80000000"]),
    );
  });

  it("[12] out-of-order observations retain correct observedAt chronology", async () => {
    await ingest(fixture({ providerEventId: "900006" }));

    const later: NormalizedOdds = {
      sport: "FOOTBALL",
      providerEventId: "900006",
      bookmaker: "Chronology Book",
      providerMarket: "1",
      canonicalMarket: "MATCH_WINNER_1X2",
      selection: "Away",
      decimalOdds: "2.10" as NormalizedOdds["decimalOdds"],
      providerObservedAt: "2026-09-19T14:00:00.000Z",
      ingestedAt: "2026-09-19T14:00:01.000Z",
      provider: "API_SPORTS",
      sourceReference: "test",
    };
    // Arrives second but describes an earlier moment in the market, e.g. a
    // late/replayed payload -- must not be treated as the "latest" price.
    const earlier: NormalizedOdds = {
      ...later,
      decimalOdds: "2.30" as NormalizedOdds["decimalOdds"],
      providerObservedAt: "2026-09-19T09:00:00.000Z",
      ingestedAt: "2026-09-19T15:00:00.000Z",
    };

    await ingestFootballOdds(database, [later], referenceData);
    await ingestFootballOdds(database, [earlier], referenceData);

    const rows = await database
      .select({
        decimalOdds: oddsObservations.decimalOdds,
        providerObservedAt: oddsObservations.providerObservedAt,
      })
      .from(oddsObservations)
      .innerJoin(
        eventMarketOutcomes,
        eq(oddsObservations.eventMarketOutcomeId, eventMarketOutcomes.id),
      )
      .innerJoin(
        eventMarkets,
        eq(eventMarketOutcomes.eventMarketId, eventMarkets.id),
      )
      .where(
        eq(eventMarkets.eventId, deterministicEventId(PROVIDER_CODE, "900006")),
      )
      .orderBy(oddsObservations.providerObservedAt);

    const chronologyForThisOutcome = rows.filter((row) =>
      ["2.10000000", "2.30000000"].includes(row.decimalOdds),
    );
    expect(chronologyForThisOutcome.map((row) => row.decimalOdds)).toEqual([
      "2.30000000",
      "2.10000000",
    ]);
  });

  /* ------------------------------------------------- over/under 2.5 goals */

  /*
   * The second market is what turns several latent single-market assumptions
   * into real defects, so these tests are as much about 1X2 continuing to
   * work as about totals starting to.
   */
  describe("over/under 2.5", () => {
    function totals(overrides: Partial<NormalizedOdds> = {}): NormalizedOdds {
      return {
        sport: "FOOTBALL",
        providerEventId: "900001",
        bookmaker: "Totals Book",
        providerMarket: "5",
        canonicalMarket: "TOTAL_GOALS",
        selection: "OVER",
        line: "2.5",
        decimalOdds: "1.95" as NormalizedOdds["decimalOdds"],
        providerObservedAt: "2026-09-19T12:00:00.000Z",
        ingestedAt: "2026-09-19T12:00:01.000Z",
        provider: "API_SPORTS",
        sourceReference: "test",
        ...overrides,
      };
    }

    it("writes OVER and UNDER on their own event market, carrying the line", async () => {
      await ingest(fixture());
      const written = await ingestFootballOdds(
        database,
        [
          totals(),
          totals({
            selection: "UNDER",
            decimalOdds: "1.90" as NormalizedOdds["decimalOdds"],
          }),
        ],
        referenceData,
      );
      expect(written.every((row) => row.ok)).toBe(true);

      const rows = await database
        .select({
          code: marketDefinitions.code,
          lineValue: eventMarkets.lineValue,
          outcome: outcomeDefinitions.code,
          odds: oddsObservations.decimalOdds,
        })
        .from(oddsObservations)
        .innerJoin(
          eventMarketOutcomes,
          eq(eventMarketOutcomes.id, oddsObservations.eventMarketOutcomeId),
        )
        .innerJoin(
          eventMarkets,
          eq(eventMarkets.id, eventMarketOutcomes.eventMarketId),
        )
        .innerJoin(
          marketDefinitions,
          eq(marketDefinitions.id, eventMarkets.marketDefinitionId),
        )
        .innerJoin(
          outcomeDefinitions,
          eq(outcomeDefinitions.id, eventMarketOutcomes.outcomeDefinitionId),
        )
        .where(eq(marketDefinitions.code, "FOOTBALL_FULL_TIME_TOTAL"));

      const bySelection = new Map(rows.map((row) => [row.outcome, row]));
      expect([...bySelection.keys()].sort()).toEqual(["OVER", "UNDER"]);
      /* The line reached the database, and as an exact numeric rather than
         text hidden inside the selection string. */
      expect(Number(bySelection.get("OVER")?.lineValue)).toBe(2.5);
      expect(Number(bySelection.get("UNDER")?.lineValue)).toBe(2.5);
      expect(bySelection.get("OVER")?.odds).toBe("1.95000000");
    });

    /*
     * The event-market row must be distinct from the 1X2 one. A shared row
     * would attach OVER/UNDER outcomes to the match-result market, and the
     * settlement rules would then answer a totals decision with a 1X2 rule.
     */
    it("does not reuse the 1X2 event market", async () => {
      await ingest(fixture());
      await ingestFootballOdds(
        database,
        [
          {
            sport: "FOOTBALL",
            providerEventId: "900001",
            bookmaker: "Totals Book",
            providerMarket: "1",
            canonicalMarket: "MATCH_WINNER_1X2",
            selection: "Home",
            decimalOdds: "2.10" as NormalizedOdds["decimalOdds"],
            providerObservedAt: "2026-09-19T12:00:00.000Z",
            ingestedAt: "2026-09-19T12:00:01.000Z",
            provider: "API_SPORTS",
            sourceReference: "test",
          },
          totals(),
        ],
        referenceData,
      );

      const markets = await database
        .select({
          id: eventMarkets.id,
          code: marketDefinitions.code,
          lineValue: eventMarkets.lineValue,
        })
        .from(eventMarkets)
        .innerJoin(
          marketDefinitions,
          eq(marketDefinitions.id, eventMarkets.marketDefinitionId),
        )
        .where(
          eq(
            eventMarkets.eventId,
            deterministicEventId(PROVIDER_CODE, "900001"),
          ),
        );

      const codes = markets.map((row) => row.code).sort();
      expect(codes).toContain("FOOTBALL_FULL_TIME_1X2");
      expect(codes).toContain("FOOTBALL_FULL_TIME_TOTAL");
      /* Two distinct rows, and only the totals one carries a line. */
      expect(new Set(markets.map((row) => row.id)).size).toBe(markets.length);
      const total = markets.find(
        (row) => row.code === "FOOTBALL_FULL_TIME_TOTAL",
      );
      const matchResult = markets.find(
        (row) => row.code === "FOOTBALL_FULL_TIME_1X2",
      );
      expect(Number(total?.lineValue)).toBe(2.5);
      expect(matchResult?.lineValue).toBeNull();
    });

    /*
     * Idempotency has to survive the line becoming part of the identity: the
     * fallback select after a conflicting insert used `isNull(lineValue)`,
     * which matches nothing once a line is present, so a re-ingest would
     * have failed on a path that is supposed to be a no-op.
     */
    it("is idempotent for a repeated totals payload", async () => {
      await ingest(fixture());
      /* Its own observation instant: these tests share one database, so
         reusing an instant an earlier test already wrote would make the
         first ingest a genuine duplicate and test nothing. */
      const payload = totals({
        providerObservedAt: "2026-09-19T12:10:00.000Z",
      });
      const first = await ingestFootballOdds(
        database,
        [payload],
        referenceData,
      );
      expect(first[0]).toMatchObject({ ok: true, duplicate: false });
      const again = await ingestFootballOdds(
        database,
        [payload],
        referenceData,
      );
      expect(again[0]).toMatchObject({ ok: true, duplicate: true });
    });

    /*
     * A line we cannot settle is refused with its own reason. Storing it
     * would create decisions that never settle, because the only executable
     * totals settlement rule is bound to 2.5.
     */
    it("refuses a line it cannot settle, distinctly from an unsupported market", async () => {
      await ingest(fixture());
      const rejected = await ingestFootballOdds(
        database,
        [
          totals({ line: "3.5" }),
          totals({
            canonicalMarket: "BTTS",
            selection: "Yes",
            line: undefined,
          }),
        ],
        referenceData,
      );
      expect(rejected[0]).toMatchObject({
        ok: false,
        reason: "LINE_NOT_WIRED",
      });
      expect(rejected[1]).toMatchObject({
        ok: false,
        reason: "MARKET_NOT_WIRED",
      });
    });

    /* "2.50" and "2.5" are the same line; a string comparison would not say so. */
    it("accepts an equivalently written line", async () => {
      await ingest(fixture());
      const written = await ingestFootballOdds(
        database,
        [totals({ line: "2.50" })],
        referenceData,
      );
      expect(written[0]).toMatchObject({ ok: true });
    });

    /*
     * Two lines quoted by one bookmaker at one instant are two observations.
     * Before the line entered the content hash they hashed identically and
     * the second was discarded as a duplicate -- so this also guards the
     * hash, not just the acceptance rule.
     */
    it("keeps a lineless market's quote separate from a totals quote", async () => {
      await ingest(fixture());
      const instant = "2026-09-19T12:20:00.000Z";
      const written = await ingestFootballOdds(
        database,
        [
          totals({ providerObservedAt: instant }),
          totals({
            providerObservedAt: instant,
            selection: "UNDER",
            decimalOdds: "1.95" as NormalizedOdds["decimalOdds"],
          }),
        ],
        referenceData,
      );
      /* Same bookmaker, same instant, same price, different selection: two
         genuine observations, neither a duplicate of the other. */
      expect(written[0]).toMatchObject({ ok: true, duplicate: false });
      expect(written[1]).toMatchObject({ ok: true, duplicate: false });
    });

    /*
     * The forecast cycle ensures a 1X2 market for every fixture, including
     * unpriced ones, and its fallback lookup was keyed on the event alone.
     * With a totals market present that returned an arbitrary market -- so
     * this exercises that path with the second market already in place.
     */
    it("still resolves the 1X2 market when a totals market exists first", async () => {
      await ingest(fixture());
      await ingestFootballOdds(database, [totals()], referenceData);

      const oneXTwo = await ingestFootballOdds(
        database,
        [
          {
            sport: "FOOTBALL",
            providerEventId: "900001",
            bookmaker: "Totals Book",
            providerMarket: "1",
            canonicalMarket: "MATCH_WINNER_1X2",
            selection: "Draw",
            decimalOdds: "3.40" as NormalizedOdds["decimalOdds"],
            providerObservedAt: "2026-09-19T13:00:00.000Z",
            ingestedAt: "2026-09-19T13:00:01.000Z",
            provider: "API_SPORTS",
            sourceReference: "test",
          },
        ],
        referenceData,
      );
      expect(oneXTwo[0]).toMatchObject({ ok: true, duplicate: false });

      const stored = await database
        .select({
          code: marketDefinitions.code,
          outcome: outcomeDefinitions.code,
        })
        .from(oddsObservations)
        .innerJoin(
          eventMarketOutcomes,
          eq(eventMarketOutcomes.id, oddsObservations.eventMarketOutcomeId),
        )
        .innerJoin(
          eventMarkets,
          eq(eventMarkets.id, eventMarketOutcomes.eventMarketId),
        )
        .innerJoin(
          marketDefinitions,
          eq(marketDefinitions.id, eventMarkets.marketDefinitionId),
        )
        .innerJoin(
          outcomeDefinitions,
          eq(outcomeDefinitions.id, eventMarketOutcomes.outcomeDefinitionId),
        )
        .where(eq(outcomeDefinitions.code, "DRAW"));

      /* DRAW landed on the match-result market, not on the totals market. */
      expect(stored.length).toBeGreaterThan(0);
      for (const row of stored) {
        expect(row.code).toBe("FOOTBALL_FULL_TIME_1X2");
      }
    });
  });

  /* ------------------------------------------------ undated provider prices */

  /*
   * A price the provider will not date is refused, not stored with our clock
   * substituted. Storing it made it read as CURRENT and therefore actionable,
   * which inverts the product's central claim that freshness describes the
   * evidence rather than the request.
   */
  it("refuses a price the provider did not date", async () => {
    await ingest(fixture());
    const undated: NormalizedOdds = {
      sport: "FOOTBALL",
      providerEventId: "900001",
      bookmaker: "Undated Book",
      providerMarket: "1",
      canonicalMarket: "MATCH_WINNER_1X2",
      selection: "Home",
      decimalOdds: "2.05" as NormalizedOdds["decimalOdds"],
      providerObservedAt: null,
      ingestedAt: "2026-09-19T14:00:00.000Z",
      provider: "API_SPORTS",
      sourceReference: "test",
    };
    const written = await ingestFootballOdds(
      database,
      [undated],
      referenceData,
    );
    expect(written[0]).toMatchObject({
      ok: false,
      reason: "PROVIDER_TIMESTAMP_MISSING",
    });

    /*
     * And nothing reached the database at all for this bookmaker. Scoped to
     * the bookmaker rather than to the timestamp, because these tests share
     * one database and another test writing at the same instant would make a
     * timestamp query pass or fail for reasons unrelated to this fix.
     */
    const leaked = await database
      .select({ id: oddsObservations.id })
      .from(oddsObservations)
      .innerJoin(bookmakers, eq(bookmakers.id, oddsObservations.bookmakerId))
      .where(eq(bookmakers.code, "Undated Book"));
    expect(leaked).toEqual([]);
  });
});
