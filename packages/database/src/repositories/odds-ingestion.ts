import { and, eq, isNull } from "drizzle-orm";
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
const WIRED_MARKET = "MATCH_WINNER_1X2" as const;
const CANONICAL_DEFINITION = canonicalMarketDefinitions.FOOTBALL_FULL_TIME_1X2;

const SELECTION_TO_OUTCOME: Readonly<Record<string, "HOME" | "DRAW" | "AWAY">> =
  Object.freeze({
    home: "HOME",
    draw: "DRAW",
    away: "AWAY",
  });

export type ReferenceData = Readonly<{
  sportId: string;
  providerId: string;
  policyVersionId: string;
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

  const marketDefinition = await upsertReturning(
    database,
    marketDefinitions,
    {
      sportId: sport.id,
      code: CANONICAL_DEFINITION.code,
      familyCode: CANONICAL_DEFINITION.familyCode,
      periodCode: CANONICAL_DEFINITION.periodCode,
      structure: CANONICAL_DEFINITION.structure,
      subjectType: CANONICAL_DEFINITION.subjectType,
      lineRequired: CANONICAL_DEFINITION.linePolicy !== "FORBIDDEN",
      lineRules: {},
      settlementRuleVersion: CANONICAL_DEFINITION.settlementRuleVersion,
      labelKey: `market.${CANONICAL_DEFINITION.code.toLowerCase()}`,
    },
    ["sportId", "code"],
    (table, values) =>
      and(eq(table.sportId, values.sportId), eq(table.code, values.code)),
  );

  const outcomeDefinitionIds: Record<"HOME" | "DRAW" | "AWAY", string> = {
    HOME: "",
    DRAW: "",
    AWAY: "",
  };
  for (const [sortOrder, code] of CANONICAL_DEFINITION.outcomeCodes.entries()) {
    if (code !== "HOME" && code !== "DRAW" && code !== "AWAY") continue;
    const outcome = await upsertReturning(
      database,
      outcomeDefinitions,
      {
        marketDefinitionId: marketDefinition.id,
        code,
        labelKey: `market.${CANONICAL_DEFINITION.code.toLowerCase()}.${code.toLowerCase()}`,
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

  return {
    sportId: sport.id,
    providerId: provider.id,
    policyVersionId: policyVersion.id,
    marketDefinitionId: marketDefinition.id,
    outcomeDefinitionIds,
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
  reason: "NO_EVENT_FOR_ODDS" | "MARKET_NOT_WIRED" | "UNMAPPED_SELECTION";
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

  const results: (OddsIngestionOutcome | OddsIngestionRejection)[] = [];
  for (const row of rows) {
    const identity = await database.query.eventIdentities.findFirst({
      where: and(
        eq(eventIdentities.providerId, reference.providerId),
        eq(eventIdentities.providerFixtureId, row.providerEventId),
      ),
    });
    if (!identity) {
      results.push({ ok: false, reason: "NO_EVENT_FOR_ODDS", row });
      continue;
    }
    if (row.canonicalMarket !== WIRED_MARKET) {
      results.push({ ok: false, reason: "MARKET_NOT_WIRED", row });
      continue;
    }
    const outcomeCode = SELECTION_TO_OUTCOME[row.selection.toLowerCase()];
    if (!outcomeCode) {
      results.push({ ok: false, reason: "UNMAPPED_SELECTION", row });
      continue;
    }

    const result = await database.transaction(async (transaction) => {
      const bookmaker = await upsertReturning(
        transaction as unknown as PrivilegedVelyqDatabase,
        bookmakers,
        { code: row.bookmaker, displayName: row.bookmaker, synthetic: false },
        ["code"],
        (table: typeof bookmakers, values: { code: string }) =>
          eq(table.code, values.code),
      );

      const eventMarketCanonicalKey = `${identity.eventId}:${reference.marketDefinitionId}:null:null`;
      const eventMarket = await upsertReturning(
        transaction as unknown as PrivilegedVelyqDatabase,
        eventMarkets,
        {
          eventId: identity.eventId,
          marketDefinitionId: reference.marketDefinitionId,
          subjectParticipantId: null,
          lineValue: null,
          canonicalKey: eventMarketCanonicalKey,
        },
        ["eventId", "marketDefinitionId", "subjectParticipantId", "lineValue"],
        (table: typeof eventMarkets, values: { eventId: string }) =>
          and(
            eq(table.eventId, values.eventId),
            eq(table.marketDefinitionId, reference.marketDefinitionId),
            isNull(table.subjectParticipantId),
            isNull(table.lineValue),
          ),
      );

      const outcomeDefinitionId = reference.outcomeDefinitionIds[outcomeCode];
      const eventMarketOutcomeCanonicalKey = `${eventMarket.id}:${outcomeDefinitionId}`;
      const eventMarketOutcome = await upsertReturning(
        transaction as unknown as PrivilegedVelyqDatabase,
        eventMarketOutcomes,
        {
          eventMarketId: eventMarket.id,
          marketDefinitionId: reference.marketDefinitionId,
          outcomeDefinitionId,
          canonicalKey: eventMarketOutcomeCanonicalKey,
        },
        ["eventMarketId", "outcomeDefinitionId"],
        (
          table: typeof eventMarketOutcomes,
          values: { eventMarketId: string },
        ) =>
          and(
            eq(table.eventMarketId, values.eventMarketId),
            eq(table.outcomeDefinitionId, outcomeDefinitionId),
          ),
      );

      const contentHash = `sha256:${createHash("sha256")
        .update(
          JSON.stringify({
            provider: row.provider,
            eventId: identity.eventId,
            bookmaker: row.bookmaker,
            market: row.canonicalMarket,
            selection: row.selection,
            decimalOdds: row.decimalOdds,
            providerObservedAt: row.providerObservedAt,
          }),
        )
        .digest("hex")}`;

      const insertedSource = await transaction
        .insert(sourceObservations)
        .values({
          providerId: reference.providerId,
          syncRunId: syncRun.id,
          observationType: "ODDS",
          providerExternalId: row.providerEventId,
          providerObservedAt: new Date(row.providerObservedAt),
          receivedAt: new Date(row.ingestedAt),
          normalizedAt: new Date(row.ingestedAt),
          normalizationVersion: "api-sports.v1",
          mappingVersion: "api-sports.v1",
          contentHash,
        })
        .onConflictDoNothing({
          target: [
            sourceObservations.providerId,
            sourceObservations.observationType,
            sourceObservations.contentHash,
          ],
        })
        .returning({ id: sourceObservations.id });
      const sourceObservation =
        insertedSource[0] ??
        (await transaction.query.sourceObservations.findFirst({
          where: and(
            eq(sourceObservations.providerId, reference.providerId),
            eq(sourceObservations.observationType, "ODDS"),
            eq(sourceObservations.contentHash, contentHash),
          ),
        }));
      if (!sourceObservation)
        throw new Error("SOURCE_OBSERVATION_PERSISTENCE_FAILED");
      const duplicate = insertedSource[0] === undefined;

      if (!duplicate) {
        await transaction
          .insert(oddsObservations)
          .values({
            sourceObservationId: sourceObservation.id,
            eventMarketOutcomeId: eventMarketOutcome.id,
            bookmakerId: bookmaker.id,
            decimalOdds: row.decimalOdds,
            providerObservedAt: new Date(row.providerObservedAt),
            receivedAt: new Date(row.ingestedAt),
            normalizedAt: new Date(row.ingestedAt),
            status: "ACTIVE",
            isSynthetic: false,
          })
          .onConflictDoNothing({
            target: [
              oddsObservations.sourceObservationId,
              oddsObservations.eventMarketOutcomeId,
              oddsObservations.bookmakerId,
            ],
          });
      }

      return {
        ok: true,
        eventId: identity.eventId,
        duplicate,
      } as const;
    });

    results.push(result);
  }

  return results;
}
