import { and, eq, inArray, isNull } from "drizzle-orm";
import { createHash } from "node:crypto";
import { canonicalMarketDefinitions } from "@velyq/market-semantics";
import type { NormalizedOdds } from "@velyq/providers";

import type { PrivilegedVelyqDatabase } from "../client.js";
import { eventIdentities, sports } from "../schema/catalog.js";
import {
  bookmakers,
  eventMarketOutcomes,
  eventMarkets,
  marketDefinitions,
  oddsObservations,
  outcomeDefinitions,
} from "../schema/market.js";
import {
  providerPolicyVersions,
  providers,
  providerSyncRuns,
  sourceObservations,
} from "../schema/operations.js";

/**
 * The one market this write path wires end to end. Extending market
 * coverage means adding another entry here and to `SELECTION_TO_OUTCOME`,
 * not changing the write path itself.
 */
/**
 * The only market this writer persists.
 *
 * Exported because callers must be able to filter to it *before* handing
 * rows over: the identity lookup below happens per row and precedes this
 * check, so a batch containing every market the provider quotes pays a
 * database round trip for each row it was always going to reject. One
 * fixture's odds response is several hundred such rows.
 */
export type WiredOddsMarket = Readonly<{
  /** The canonical market definition this provider-neutral code maps to. */
  definition: (typeof canonicalMarketDefinitions)[keyof typeof canonicalMarketDefinitions];
  /** Lowercased provider selection -> canonical outcome code. */
  selections: Readonly<Record<string, string>>;
  /**
   * The single line this market is wired at, or null when the market has no
   * line.
   *
   * Pinned to one value rather than accepting whatever the provider quotes.
   * `FOOTBALL_FULL_TIME_TOTAL` can represent any half-goal line, but the only
   * executable settlement rule bound to it is
   * `FOOTBALL_TOTAL_2_5_FULL_TIME_V1`. Storing a 1.5 or 3.5 line would
   * therefore create decisions that can never settle -- a permanently
   * unresolved position is worse than an absent one, so other lines are
   * refused at the door with a stated reason.
   */
  line: string | null;
}>;

/**
 * The markets the live odds path actually writes, keyed by the
 * provider-neutral code `normalizeOdds` produces.
 *
 * Two vocabularies meet here and they are deliberately not merged: the
 * provider-neutral code (`MATCH_WINNER_1X2`, `TOTAL_GOALS`) is what an adapter
 * emits, and the canonical definition code (`FOOTBALL_FULL_TIME_1X2`) is what
 * the database and the settlement rules use. This table is the only place
 * that translation lives, so a second provider needs a new adapter rather
 * than changes here.
 */
export const WIRED_ODDS_MARKETS: Readonly<Record<string, WiredOddsMarket>> =
  Object.freeze({
    MATCH_WINNER_1X2: Object.freeze({
      definition: canonicalMarketDefinitions.FOOTBALL_FULL_TIME_1X2,
      selections: Object.freeze({ home: "HOME", draw: "DRAW", away: "AWAY" }),
      line: null,
    }),
    TOTAL_GOALS: Object.freeze({
      definition: canonicalMarketDefinitions.FOOTBALL_FULL_TIME_TOTAL,
      selections: Object.freeze({ over: "OVER", under: "UNDER" }),
      line: "2.5",
    }),
  });

/**
 * Whether a provider-neutral market code is worth a database round trip.
 *
 * Callers must filter with this *before* handing rows over: the identity
 * lookup happens per row and precedes the market check, so a batch containing
 * every market the provider quotes pays a round trip for each row it was
 * always going to reject. One fixture's odds response is several hundred
 * such rows.
 */
export function isWiredOddsMarket(canonicalMarket: string): boolean {
  return Object.hasOwn(WIRED_ODDS_MARKETS, canonicalMarket);
}

/** Retained for the 1X2-only call sites that predate the second market. */
export const WIRED_ODDS_MARKET = "MATCH_WINNER_1X2" as const;

/**
 * Whether a provider-quoted line is the line a market is wired at.
 *
 * Compared numerically, because "2.5" and "2.50" are the same line and a
 * string comparison would reject the second. Absent on both sides counts as
 * equal; absent on one side never does -- a lineless quote on a market that
 * requires a line is not a match, it is missing data.
 */
function sameLine(quoted: string | undefined, wired: string | null): boolean {
  if (wired === null) return quoted === undefined || quoted === "";
  if (quoted === undefined || quoted === "") return false;
  const parsed = Number(quoted);
  /* Number() only decides equality of two known-good decimal literals here;
     nothing derived from it is persisted or used in policy arithmetic. */
  return Number.isFinite(parsed) && parsed === Number(wired);
}

export type MarketReference = Readonly<{
  marketDefinitionId: string;
  outcomeDefinitionIds: Readonly<Record<string, string>>;
  /** The line this market is wired at; null when it has none. */
  lineValue: string | null;
}>;

export type ReferenceData = Readonly<{
  sportId: string;
  providerId: string;
  policyVersionId: string;
  /** Every wired market, keyed by provider-neutral code. */
  markets: Readonly<Record<string, MarketReference>>;
  /*
   * The 1X2 market, kept as named fields because the forecast cycle ensures
   * exactly that market for every fixture -- including fixtures nobody has
   * priced -- and reads it by name. They are a view onto `markets`, never a
   * second source of truth.
   */
  marketDefinitionId: string;
  outcomeDefinitionIds: Readonly<Record<"HOME" | "DRAW" | "AWAY", string>>;
}>;

/**
 * Idempotently ensures the reference/catalog rows the odds write path
 * depends on: a sport, a provider, one provider policy version, and one
 * market definition with its outcome definitions. All of it is versioned,
 * deterministic reference data -- never per-request observational data --
 * so upserting it on every ingestion run is safe and cheap.
 */
export async function ensureFootballReferenceData(
  database: PrivilegedVelyqDatabase,
  providerCode: string,
): Promise<ReferenceData> {
  const sport = await upsertReturning(
    database,
    sports,
    { code: "FOOTBALL", nameKey: "sport.football" },
    ["code"],
    (table, values) => eq(table.code, values.code),
  );

  const provider = await upsertReturning(
    database,
    providers,
    {
      code: providerCode,
      displayName: providerCode,
      isSynthetic: false,
    },
    ["code"],
    (table, values) => eq(table.code, values.code),
  );

  const policyVersion = await upsertReturning(
    database,
    providerPolicyVersions,
    {
      providerId: provider.id,
      version: "api-sports.v1",
      policy: {},
      effectiveFrom: new Date("2026-01-01T00:00:00Z"),
    },
    ["providerId", "version"],
    (table, values) =>
      and(
        eq(table.providerId, values.providerId),
        eq(table.version, values.version),
      ),
  );

  /*
   * Every wired market, not just 1X2. The loop is what makes a second market
   * a table entry rather than a code change: the outcome-definition creation
   * previously skipped anything that was not HOME/DRAW/AWAY, so OVER and
   * UNDER definitions were silently never created and the totals market
   * could not have been written even if the writer had accepted it.
   */
  const markets: Record<string, MarketReference> = {};
  for (const [providerNeutralCode, wired] of Object.entries(
    WIRED_ODDS_MARKETS,
  )) {
    const definition = wired.definition;
    const marketDefinition = await upsertReturning(
      database,
      marketDefinitions,
      {
        sportId: sport.id,
        code: definition.code,
        familyCode: definition.familyCode,
        periodCode: definition.periodCode,
        structure: definition.structure,
        subjectType: definition.subjectType,
        lineRequired: definition.linePolicy !== "FORBIDDEN",
        /*
         * The increment is carried through rather than left empty, so the
         * stored definition round-trips the constraint the semantics package
         * states instead of merely asserting that *a* line is required.
         */
        lineRules:
          definition.linePolicy === "FORBIDDEN"
            ? {}
            : {
                linePolicy: definition.linePolicy,
                allowedLineIncrement: definition.allowedLineIncrement ?? null,
                wiredLineValue: wired.line,
              },
        settlementRuleVersion: definition.settlementRuleVersion,
        labelKey: `market.${definition.code.toLowerCase()}`,
      },
      ["sportId", "code"],
      (table, values) =>
        and(eq(table.sportId, values.sportId), eq(table.code, values.code)),
    );

    const outcomeDefinitionIds: Record<string, string> = {};
    for (const [sortOrder, code] of definition.outcomeCodes.entries()) {
      const outcome = await upsertReturning(
        database,
        outcomeDefinitions,
        {
          marketDefinitionId: marketDefinition.id,
          code,
          labelKey: `market.${definition.code.toLowerCase()}.${code.toLowerCase()}`,
          sortOrder,
        },
        ["marketDefinitionId", "code"],
        (table, values) =>
          and(
            eq(table.marketDefinitionId, values.marketDefinitionId),
            eq(table.code, values.code),
          ),
      );
      outcomeDefinitionIds[code] = outcome.id;
    }

    markets[providerNeutralCode] = {
      marketDefinitionId: marketDefinition.id,
      outcomeDefinitionIds,
      lineValue: wired.line,
    };
  }

  const matchResult = markets[WIRED_ODDS_MARKET];
  if (!matchResult) throw new Error("MATCH_RESULT_REFERENCE_DATA_MISSING");
  const oneXTwo = matchResult.outcomeDefinitionIds;
  for (const code of ["HOME", "DRAW", "AWAY"] as const) {
    if (!oneXTwo[code]) throw new Error(`OUTCOME_DEFINITION_MISSING:${code}`);
  }

  return {
    sportId: sport.id,
    providerId: provider.id,
    policyVersionId: policyVersion.id,
    markets,
    marketDefinitionId: matchResult.marketDefinitionId,
    outcomeDefinitionIds: {
      HOME: oneXTwo["HOME"]!,
      DRAW: oneXTwo["DRAW"]!,
      AWAY: oneXTwo["AWAY"]!,
    },
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any -- a small generic upsert
   helper shared across four unrelated reference tables; typing it precisely
   would require a conditional-type per table for no real safety benefit,
   since every call site already supplies a concretely-typed `values`. */
async function upsertReturning(
  database: PrivilegedVelyqDatabase,
  table: any,
  values: Record<string, unknown>,
  conflictColumns: readonly string[],
  whereClause: (table: any, values: any) => any,
): Promise<{ id: string }> {
  const inserted = await database
    .insert(table)
    .values(values)
    .onConflictDoNothing({
      target: conflictColumns.map((column) => table[column]),
    })
    .returning({ id: table.id });
  if (inserted[0]) return inserted[0];
  const [existing] = await database
    .select({ id: table.id })
    .from(table)
    .where(whereClause(table, values))
    .limit(1);
  if (!existing) throw new Error("REFERENCE_DATA_UPSERT_FAILED");
  return existing;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export type OddsIngestionRejection = Readonly<{
  ok: false;
  reason:
    | "NO_EVENT_FOR_ODDS"
    | "MARKET_NOT_WIRED"
    /** The market is supported but not at the line the provider quoted. */
    | "LINE_NOT_WIRED"
    | "UNMAPPED_SELECTION";
  row: NormalizedOdds;
}>;

export type OddsIngestionOutcome = Readonly<{
  ok: true;
  eventId: string;
  duplicate: boolean;
}>;

/**
 * Writes one batch of normalized odds observations as history, never as a
 * single mutable current price.
 *
 * Idempotency and history both come from the same mechanism:
 * `source_observations` is unique on (provider, observation type, content
 * hash), where the content hash covers the full observation including its
 * provider timestamp -- so the identical payload observed twice is one row
 * (true duplicate), while the same price observed again later at a new
 * `providerObservedAt` is a new row (genuine new history), never an
 * overwrite of the first.
 */
export async function ingestFootballOdds(
  database: PrivilegedVelyqDatabase,
  rows: readonly NormalizedOdds[],
  reference: ReferenceData,
): Promise<readonly (OddsIngestionOutcome | OddsIngestionRejection)[]> {
  if (rows.length === 0) return [];

  /*
   * Written as a batch rather than a row at a time.
   *
   * The previous shape was one transaction per observation, each doing seven
   * to ten round trips: an identity lookup, a bookmaker upsert, an event
   * market upsert, an outcome upsert, a source-observation insert with a
   * fallback select, and the observation insert. Roughly twelve seconds per
   * fixture, which is why the bookmaker panel was capped at six and why
   * wiring a second market would have doubled a cost that was already the
   * binding constraint on the invocation's wall clock.
   *
   * Almost all of that work is shared within a batch: one fixture's response
   * has one event identity, at most a handful of bookmakers, and at most two
   * markets with five outcomes between them. So the shared entities are
   * resolved once, and the observations go in as two multi-row inserts.
   *
   * The semantics are unchanged, and specifically:
   *   - idempotency still comes from `source_observations`' unique
   *     (provider, type, content hash); a row is a duplicate exactly when the
   *     insert did not return it;
   *   - history still accumulates, because the hash covers
   *     `providerObservedAt`;
   *   - nothing is ever updated in place.
   */

  const [syncRun] = await database
    .insert(providerSyncRuns)
    .values({
      providerId: reference.providerId,
      capability: "ODDS",
      status: "COMPLETED",
      providerSchemaVersion: "api-sports.v1",
      normalizationVersion: "api-sports.v1",
      mappingVersion: "api-sports.v1",
      policyVersionId: reference.policyVersionId,
      startedAt: new Date(),
      completedAt: new Date(),
    })
    .returning({ id: providerSyncRuns.id });
  if (!syncRun) throw new Error("PROVIDER_SYNC_RUN_PERSISTENCE_FAILED");

  /* ------------------------------------------------- shared identity lookups */

  /*
   * One query for every fixture in the batch instead of one per row. A batch
   * is normally a single fixture, but a caller is free to pass several and
   * this keeps that linear in fixtures rather than in observations.
   */
  const providerFixtureIds = [
    ...new Set(rows.map((row) => row.providerEventId)),
  ];
  const identityRows =
    providerFixtureIds.length === 0
      ? []
      : await database
          .select({
            providerFixtureId: eventIdentities.providerFixtureId,
            eventId: eventIdentities.eventId,
          })
          .from(eventIdentities)
          .where(
            and(
              eq(eventIdentities.providerId, reference.providerId),
              inArray(eventIdentities.providerFixtureId, providerFixtureIds),
            ),
          );
  const eventIdByProviderFixtureId = new Map(
    identityRows.map((row) => [row.providerFixtureId, row.eventId]),
  );

  /* --------------------------------------------------------- classify rows */

  type AcceptedRow = Readonly<{
    row: NormalizedOdds;
    eventId: string;
    market: MarketReference;
    outcomeDefinitionId: string;
    contentHash: string;
  }>;

  const results: (OddsIngestionOutcome | OddsIngestionRejection)[] = [];
  const accepted: AcceptedRow[] = [];
  /* Index into `results` for each accepted row, so the duplicate flag can be
     filled in once the inserts have said which rows were new. */
  const resultIndexByHash = new Map<string, number[]>();

  for (const row of rows) {
    const eventId = eventIdByProviderFixtureId.get(row.providerEventId);
    if (!eventId) {
      results.push({ ok: false, reason: "NO_EVENT_FOR_ODDS", row });
      continue;
    }
    const wired = WIRED_ODDS_MARKETS[row.canonicalMarket];
    const market = wired ? reference.markets[row.canonicalMarket] : undefined;
    if (!wired || !market) {
      results.push({ ok: false, reason: "MARKET_NOT_WIRED", row });
      continue;
    }
    /*
     * The line is compared against the one this market is wired at, not
     * merely required to be present. A quote on a line we cannot settle is
     * refused with its own reason, so the funnel can tell "this market is
     * unsupported" apart from "this line is".
     */
    if (!sameLine(row.line, wired.line)) {
      results.push({ ok: false, reason: "LINE_NOT_WIRED", row });
      continue;
    }
    const outcomeCode = wired.selections[row.selection.toLowerCase()];
    const outcomeDefinitionId = outcomeCode
      ? market.outcomeDefinitionIds[outcomeCode]
      : undefined;
    if (!outcomeCode || !outcomeDefinitionId) {
      results.push({ ok: false, reason: "UNMAPPED_SELECTION", row });
      continue;
    }

    const contentHash = oddsContentHash({
      provider: row.provider,
      eventId,
      bookmaker: row.bookmaker,
      market: row.canonicalMarket,
      selection: row.selection,
      line: market.lineValue,
      decimalOdds: row.decimalOdds,
      providerObservedAt: row.providerObservedAt,
    });

    accepted.push({
      row,
      eventId,
      market,
      outcomeDefinitionId,
      contentHash,
    });
    const index = results.length;
    results.push({ ok: true, eventId, duplicate: false });
    resultIndexByHash.set(contentHash, [
      ...(resultIndexByHash.get(contentHash) ?? []),
      index,
    ]);
  }

  if (accepted.length === 0) return results;

  /* ------------------------------------------------------ shared reference */

  return database.transaction(async (transaction) => {
    const scoped = transaction as unknown as PrivilegedVelyqDatabase;

    const bookmakerIdByCode = new Map<string, string>();
    for (const code of new Set(accepted.map((item) => item.row.bookmaker))) {
      const bookmaker = await upsertReturning(
        scoped,
        bookmakers,
        { code, displayName: code, synthetic: false },
        ["code"],
        (table: typeof bookmakers, values: { code: string }) =>
          eq(table.code, values.code),
      );
      bookmakerIdByCode.set(code, bookmaker.id);
    }

    /*
     * Keyed by the market's full natural identity, never by event alone. Two
     * markets on one event is precisely the case that made an
     * event-only lookup wrong.
     */
    const eventMarketIdByKey = new Map<string, string>();
    for (const item of accepted) {
      const key = `${item.eventId}:${item.market.marketDefinitionId}:${item.market.lineValue ?? "null"}`;
      if (eventMarketIdByKey.has(key)) continue;
      const canonicalKey = `${item.eventId}:${item.market.marketDefinitionId}:null:${item.market.lineValue ?? "null"}`;
      const eventMarket = await upsertReturning(
        scoped,
        eventMarkets,
        {
          eventId: item.eventId,
          marketDefinitionId: item.market.marketDefinitionId,
          subjectParticipantId: null,
          lineValue: item.market.lineValue,
          canonicalKey,
        },
        ["eventId", "marketDefinitionId", "subjectParticipantId", "lineValue"],
        (table: typeof eventMarkets) =>
          and(
            eq(table.eventId, item.eventId),
            eq(table.marketDefinitionId, item.market.marketDefinitionId),
            isNull(table.subjectParticipantId),
            /*
             * `isNull` was correct only while every market was lineless. With
             * a line present it matches nothing, so the fallback select after
             * a conflicting insert finds no row and an idempotent write
             * fails.
             */
            item.market.lineValue === null
              ? isNull(table.lineValue)
              : eq(table.lineValue, item.market.lineValue),
          ),
      );
      eventMarketIdByKey.set(key, eventMarket.id);
    }

    const outcomeIdByKey = new Map<string, string>();
    for (const item of accepted) {
      const marketKey = `${item.eventId}:${item.market.marketDefinitionId}:${item.market.lineValue ?? "null"}`;
      const eventMarketId = eventMarketIdByKey.get(marketKey)!;
      const key = `${eventMarketId}:${item.outcomeDefinitionId}`;
      if (outcomeIdByKey.has(key)) continue;
      const outcome = await upsertReturning(
        scoped,
        eventMarketOutcomes,
        {
          eventMarketId,
          marketDefinitionId: item.market.marketDefinitionId,
          outcomeDefinitionId: item.outcomeDefinitionId,
          canonicalKey: key,
        },
        ["eventMarketId", "outcomeDefinitionId"],
        (table: typeof eventMarketOutcomes) =>
          and(
            eq(table.eventMarketId, eventMarketId),
            eq(table.outcomeDefinitionId, item.outcomeDefinitionId),
          ),
      );
      outcomeIdByKey.set(key, outcome.id);
    }

    /* ------------------------------------------------ bulk observation write */

    /*
     * Deduplicated within the batch before the insert. `ON CONFLICT DO
     * NOTHING` copes with a repeat inside one statement, but relying on that
     * would make the returned-row count -- which is how a duplicate is
     * detected -- depend on statement internals rather than on data.
     */
    const uniqueByHash = new Map<string, AcceptedRow>();
    for (const item of accepted) {
      if (!uniqueByHash.has(item.contentHash)) {
        uniqueByHash.set(item.contentHash, item);
      }
    }
    const batch = [...uniqueByHash.values()];

    const insertedSources = await transaction
      .insert(sourceObservations)
      .values(
        batch.map((item) => ({
          providerId: reference.providerId,
          syncRunId: syncRun.id,
          observationType: "ODDS",
          providerExternalId: item.row.providerEventId,
          providerObservedAt: new Date(item.row.providerObservedAt),
          receivedAt: new Date(item.row.ingestedAt),
          normalizedAt: new Date(item.row.ingestedAt),
          normalizationVersion: "api-sports.v1",
          mappingVersion: "api-sports.v1",
          contentHash: item.contentHash,
        })),
      )
      .onConflictDoNothing({
        target: [
          sourceObservations.providerId,
          sourceObservations.observationType,
          sourceObservations.contentHash,
        ],
      })
      .returning({
        id: sourceObservations.id,
        contentHash: sourceObservations.contentHash,
      });

    /*
     * Only rows the insert returned are new. Everything else was already
     * stored -- the same observation, at the same provider instant, with the
     * same price -- and is reported as a duplicate rather than rewritten.
     */
    const newSourceIdByHash = new Map(
      insertedSources.map((row) => [row.contentHash, row.id]),
    );

    const observationValues = batch.flatMap((item) => {
      const sourceObservationId = newSourceIdByHash.get(item.contentHash);
      if (sourceObservationId === undefined) return [];
      const marketKey = `${item.eventId}:${item.market.marketDefinitionId}:${item.market.lineValue ?? "null"}`;
      const eventMarketId = eventMarketIdByKey.get(marketKey)!;
      const outcomeId = outcomeIdByKey.get(
        `${eventMarketId}:${item.outcomeDefinitionId}`,
      )!;
      return [
        {
          sourceObservationId,
          eventMarketOutcomeId: outcomeId,
          bookmakerId: bookmakerIdByCode.get(item.row.bookmaker)!,
          decimalOdds: item.row.decimalOdds,
          providerObservedAt: new Date(item.row.providerObservedAt),
          receivedAt: new Date(item.row.ingestedAt),
          normalizedAt: new Date(item.row.ingestedAt),
          status: "ACTIVE",
          isSynthetic: false,
        },
      ];
    });

    if (observationValues.length > 0) {
      await transaction
        .insert(oddsObservations)
        .values(observationValues)
        .onConflictDoNothing({
          target: [
            oddsObservations.sourceObservationId,
            oddsObservations.eventMarketOutcomeId,
            oddsObservations.bookmakerId,
          ],
        });
    }

    for (const [contentHash, indexes] of resultIndexByHash) {
      const duplicate = !newSourceIdByHash.has(contentHash);
      for (const [position, index] of indexes.entries()) {
        const current = results[index];
        if (!current || !current.ok) continue;
        results[index] = {
          ...current,
          /* A hash repeated inside one batch: the first occurrence is the
             write, the rest are duplicates of it. */
          duplicate: duplicate || position > 0,
        };
      }
    }

    return results;
  });
}

/**
 * The observation's identity, as a hash.
 *
 * Covers the provider timestamp, so the same price observed again later is
 * new history rather than a duplicate; and covers the line, so two lines from
 * one bookmaker at one instant are two observations rather than one.
 */
function oddsContentHash(
  input: Readonly<{
    provider: string;
    eventId: string;
    bookmaker: string;
    market: string;
    selection: string;
    line: string | null;
    decimalOdds: string;
    providerObservedAt: string;
  }>,
): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(input)).digest("hex")}`;
}
