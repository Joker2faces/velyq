import { and, desc, eq, inArray } from "drizzle-orm";
import { createHash } from "node:crypto";
import {
  orchestrateResultSettlement,
  type ProviderFinalResult,
  type SettlementCandidate,
} from "@velyq/application";
import { canonicalMarketDefinitions } from "@velyq/market-semantics";
import { eligibleClv, selectClosingPrice, type PricePoint } from "@velyq/analytics";
import type { NormalizedResult } from "@velyq/providers";
import type { PrivilegedVelyqDatabase } from "../client.js";
import { eventIdentities, events } from "../schema/catalog.js";
import {
  decisions,
  eventResults,
  marketSettlements,
} from "../schema/intelligence.js";
import {
  eventMarketOutcomes,
  eventMarkets,
  marketDefinitions,
  oddsObservations,
  outcomeDefinitions,
} from "../schema/market.js";
import { providerSyncRuns, sourceObservations } from "../schema/operations.js";

/**
 * Result ingestion and settlement, one transaction per fixture.
 *
 * Writing a result without the settlements it implies is not a recoverable
 * partial success. The fixture becomes terminal, so the scheduler never asks
 * about it again, and the decisions it answers stay unsettled forever with
 * nothing left to re-trigger them. One transaction per fixture is therefore
 * the unit that either fully answers a match or leaves it untouched.
 */

/**
 * Decision statuses whose outcome is meaningful to settle.
 *
 * A decision the engine refused -- NO_BET, WAIT, INSUFFICIENT_DATA,
 * WAIT_FOR_LINEUP -- has no position to win or lose, so settling it would
 * fabricate a record. EDGE_DISAPPEARED is included deliberately: that
 * decision was live and then the market moved, and suppressing its outcome is
 * precisely how a performance record flatters itself.
 */
const SETTLEABLE_DECISION_STATUSES = ["STRONG_EDGE", "EDGE_DISAPPEARED"];

/**
 * The markets the settlement rules can actually settle, keyed by the
 * canonical market-definition code the odds writer creates.
 *
 * Every other canonical definition is deliberately absent. A market present
 * here but unsupported by `settleDecision` would be settled by whichever rule
 * branch happened to fall through, which is how a totals decision acquires a
 * 1X2 outcome.
 */
const SETTLEABLE_MARKETS: Readonly<
  Record<
    string,
    Readonly<{ market: SettlementCandidate["market"]; ruleVersion: string }>
  >
> = {
  [canonicalMarketDefinitions.FOOTBALL_FULL_TIME_1X2.code]: {
    market: "1X2",
    ruleVersion:
      canonicalMarketDefinitions.FOOTBALL_FULL_TIME_1X2.settlementRuleVersion,
  },
  [canonicalMarketDefinitions.FOOTBALL_FULL_TIME_TOTAL.code]: {
    market: "OVER_UNDER_2_5",
    ruleVersion:
      canonicalMarketDefinitions.FOOTBALL_FULL_TIME_TOTAL.settlementRuleVersion,
  },
};

/** Outcome codes the settlement engine understands, per market. */
const SETTLEABLE_SELECTIONS: Readonly<
  Record<
    SettlementCandidate["market"],
    readonly SettlementCandidate["selection"][]
  >
> = {
  "1X2": ["HOME", "DRAW", "AWAY"],
  OVER_UNDER_2_5: ["OVER", "UNDER"],
};

export type ResultIngestionSummary = Readonly<{
  received: number;
  written: number;
  duplicate: number;
  settlementsWritten: number;
  skippedByReason: Readonly<Record<string, number>>;
  /** What the provider last said about each fixture, for the ask marker. */
  statusByProviderFixtureId: Readonly<Record<string, string>>;
}>;

function bump(counter: Record<string, number>, key: string): void {
  counter[key] = (counter[key] ?? 0) + 1;
}

/**
 * Decisions on this event that could carry an outcome.
 *
 * `intelligence.decisions` has no market column, so the market is recovered
 * by joining out to the market definition. Idempotency comes from the source
 * observation's content hash rather than from filtering here: a replayed
 * provider response produces the same hash, so it never reaches this query.
 */
async function settlementCandidatesFor(
  transaction: PrivilegedVelyqDatabase,
  eventId: string,
): Promise<
  readonly Readonly<{
    decisionId: string;
    marketCode: string;
    outcomeCode: string;
    eventMarketOutcomeId: string;
    offeredOdds: string | null;
    decisionCreatedAt: Date;
    kickoff: Date;
  }>[]
> {
  return transaction
    .select({
      decisionId: decisions.id,
      marketCode: marketDefinitions.code,
      outcomeCode: outcomeDefinitions.code,
      eventMarketOutcomeId: eventMarketOutcomes.id,
      offeredOdds: decisions.offeredOdds,
      decisionCreatedAt: decisions.createdAt,
      kickoff: events.startsAt,
    })
    .from(decisions)
    .innerJoin(
      eventMarketOutcomes,
      eq(eventMarketOutcomes.id, decisions.eventMarketOutcomeId),
    )
    .innerJoin(
      eventMarkets,
      eq(eventMarkets.id, eventMarketOutcomes.eventMarketId),
    )
    .innerJoin(
      marketDefinitions,
      eq(marketDefinitions.id, eventMarketOutcomes.marketDefinitionId),
    )
    .innerJoin(
      outcomeDefinitions,
      eq(outcomeDefinitions.id, eventMarketOutcomes.outcomeDefinitionId),
    )
    .innerJoin(events, eq(events.id, eventMarkets.eventId))
    .where(
      and(
        eq(eventMarkets.eventId, eventId),
        inArray(decisions.status, SETTLEABLE_DECISION_STATUSES),
      ),
    );
}

/**
 * Closing-price policy v1, applied at settlement time (see
 * `selectClosingPrice`/`eligibleClv` in packages/analytics for the full
 * rules): same outcome only, ACTIVE prices at/before kickoff, each
 * bookmaker's last observation, books over 60 minutes stale relative to the
 * freshest discarded, median of what remains. CLV is withheld (not zero)
 * whenever the decision was placed at/after kickoff, the closing price
 * itself was observed after kickoff, or no valid closing price exists at
 * all -- a missing close is a real "we don't know", never fabricated as 0%.
 *
 * Computed here, once per settling fixture, rather than on every customer
 * read: CLV is a fact about a specific historical moment (the close), not
 * something that should be able to drift on re-read as more post-kickoff
 * odds happen to still be stored.
 */
async function closingPricesFor(
  transaction: PrivilegedVelyqDatabase,
  candidates: readonly Readonly<{
    decisionId: string;
    eventMarketOutcomeId: string;
    offeredOdds: string | null;
    decisionCreatedAt: Date;
    kickoff: Date;
  }>[],
): Promise<
  ReadonlyMap<string, Readonly<{ closingOdds: string | null; clv: string | null }>>
> {
  const outcomeIds = [...new Set(candidates.map((c) => c.eventMarketOutcomeId))];
  if (outcomeIds.length === 0) return new Map();
  const rows = await transaction
    .select({
      id: oddsObservations.id,
      outcomeId: oddsObservations.eventMarketOutcomeId,
      bookmakerId: oddsObservations.bookmakerId,
      odds: oddsObservations.decimalOdds,
      observedAt: oddsObservations.providerObservedAt,
      status: oddsObservations.status,
    })
    .from(oddsObservations)
    .where(inArray(oddsObservations.eventMarketOutcomeId, outcomeIds))
    .orderBy(desc(oddsObservations.providerObservedAt));

  const byOutcome = new Map<string, PricePoint[]>();
  for (const row of rows) {
    const points = byOutcome.get(row.outcomeId) ?? [];
    points.push({
      id: row.id,
      outcomeId: row.outcomeId,
      bookmakerId: row.bookmakerId,
      odds: row.odds as PricePoint["odds"],
      observedAt: row.observedAt.toISOString(),
      status: row.status as PricePoint["status"],
    });
    byOutcome.set(row.outcomeId, points);
  }

  /*
   * The closing price is a fact about the MARKET at kickoff, shared by
   * every decision on that outcome -- computed once per outcome, not once
   * per decision, even though several decisions (an original and a
   * lineup-triggered recompute, say) can share one outcome and each still
   * gets its own CLV against its own decision time and price.
   */
  const closingByOutcome = new Map<
    string,
    ReturnType<typeof selectClosingPrice>
  >();
  const result = new Map<
    string,
    Readonly<{ closingOdds: string | null; clv: string | null }>
  >();
  for (const candidate of candidates) {
    let closing = closingByOutcome.get(candidate.eventMarketOutcomeId);
    if (closing === undefined) {
      closing = selectClosingPrice({
        outcomeId: candidate.eventMarketOutcomeId,
        kickoff: candidate.kickoff.toISOString(),
        observations: byOutcome.get(candidate.eventMarketOutcomeId) ?? [],
      });
      closingByOutcome.set(candidate.eventMarketOutcomeId, closing);
    }
    const clv = candidate.offeredOdds
      ? eligibleClv({
          decisionOutcomeId: candidate.eventMarketOutcomeId,
          decisionOdds: candidate.offeredOdds as never,
          decisionAt: candidate.decisionCreatedAt.toISOString(),
          kickoff: candidate.kickoff.toISOString(),
          closing,
          closingOutcomeId: candidate.eventMarketOutcomeId,
        })
      : null;
    result.set(candidate.decisionId, {
      closingOdds: closing?.odds ?? null,
      clv,
    });
  }
  return result;
}

type FixtureOutcome = Readonly<{
  reason: string | null;
  duplicate: boolean;
  settlements: number;
}>;

/**
 * Writes provider results and settles the decisions they answer.
 *
 * Each fixture is independent. One that cannot be attributed to an event, or
 * whose write fails, is counted and skipped rather than failing the batch: a
 * batch covers up to twenty fixtures, and one unresolvable identity must not
 * discard the other nineteen.
 */
export async function ingestFootballResults(
  database: PrivilegedVelyqDatabase,
  input: Readonly<{
    providerId: string;
    results: readonly NormalizedResult[];
    /** Provider policy version in force, required by `provider_sync_runs`. */
    policyVersionId: string;
  }>,
): Promise<ResultIngestionSummary> {
  const skippedByReason: Record<string, number> = {};
  const statusByProviderFixtureId: Record<string, string> = {};
  let written = 0;
  let duplicate = 0;
  let settlementsWritten = 0;

  if (input.results.length === 0) {
    return {
      received: 0,
      written: 0,
      duplicate: 0,
      settlementsWritten: 0,
      skippedByReason,
      statusByProviderFixtureId,
    };
  }

  /*
   * One sync run for the whole batch, created before the per-fixture
   * transactions rather than inside them. The batch came from a single
   * provider request, so it is a single act of synchronisation -- and a
   * per-fixture run row would make twenty rows out of one call, which is
   * exactly the provenance noise the table exists to avoid.
   */
  const [syncRun] = await database
    .insert(providerSyncRuns)
    .values({
      providerId: input.providerId,
      capability: "RESULT",
      status: "COMPLETED",
      providerSchemaVersion: "api-sports.v1",
      normalizationVersion: "api-sports.v1",
      mappingVersion: "api-sports.v1",
      policyVersionId: input.policyVersionId,
      startedAt: new Date(),
      completedAt: new Date(),
      receivedCount: input.results.length,
    })
    .returning({ id: providerSyncRuns.id });
  if (!syncRun) throw new Error("RESULT_SYNC_RUN_PERSISTENCE_FAILED");

  for (const result of input.results) {
    /*
     * Recorded before anything can fail. The marker's job is to say what the
     * provider reported, whether or not we could use it -- re-asking about a
     * fixture whose answer we cannot process is how a ten-request daily
     * budget becomes a standing charge on one broken row.
     */
    statusByProviderFixtureId[result.providerEventId] = result.status;

    try {
      const outcome: FixtureOutcome = await database.transaction(
        async (transaction) => {
          const scoped = transaction as unknown as PrivilegedVelyqDatabase;

          const [identity] = await transaction
            .select({ eventId: eventIdentities.eventId })
            .from(eventIdentities)
            .where(
              and(
                eq(eventIdentities.providerId, input.providerId),
                eq(eventIdentities.providerFixtureId, result.providerEventId),
              ),
            )
            .limit(1);
          if (!identity) {
            return {
              reason: "RESULT_EVENT_IDENTITY_NOT_FOUND",
              duplicate: false,
              settlements: 0,
            };
          }

          /*
           * The hash covers the score and the lifecycle state, so an
           * identically re-reported result is a duplicate while a corrected
           * score is a new observation. That is what makes corrections
           * possible at all without ever updating a stored row.
           */
          const contentHash = `sha256:${createHash("sha256")
            .update(
              JSON.stringify({
                provider: result.provider,
                eventId: identity.eventId,
                status: result.status,
                homeScore: result.homeScore,
                awayScore: result.awayScore,
                providerObservedAt: result.providerObservedAt,
              }),
            )
            .digest("hex")}`;

          const inserted = await transaction
            .insert(sourceObservations)
            .values({
              providerId: input.providerId,
              syncRunId: syncRun.id,
              observationType: "RESULT",
              providerExternalId: result.providerEventId,
              providerObservedAt: new Date(result.providerObservedAt),
              receivedAt: new Date(result.providerObservedAt),
              normalizedAt: new Date(result.providerObservedAt),
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

          const source = inserted[0];
          if (source === undefined) {
            return { reason: null, duplicate: true, settlements: 0 };
          }

          const [storedResult] = await transaction
            .insert(eventResults)
            .values({
              eventId: identity.eventId,
              sourceObservationId: source.id,
              status: result.status,
              homeScore: result.homeScore,
              awayScore: result.awayScore,
              providerObservedAt: new Date(result.providerObservedAt),
            })
            .onConflictDoNothing({
              target: [eventResults.sourceObservationId, eventResults.eventId],
            })
            .returning({ id: eventResults.id });
          if (!storedResult) throw new Error("RESULT_PERSISTENCE_FAILED");

          /*
           * Only a terminal state settles anything. An IN_PROGRESS result is
           * still worth storing -- it is how the scheduler knows to ask again
           * -- but running the settlement rules over a half-time score would
           * post real outcomes for matches that are not over.
           */
          if (result.status !== "FINAL") {
            return { reason: null, duplicate: false, settlements: 0 };
          }

          const rows = await settlementCandidatesFor(scoped, identity.eventId);
          const candidates: SettlementCandidate[] = [];
          const ruleVersionByDecisionId = new Map<string, string>();
          for (const row of rows) {
            const market = SETTLEABLE_MARKETS[row.marketCode];
            if (!market) {
              bump(skippedByReason, "SETTLEMENT_MARKET_NOT_SETTLEABLE");
              continue;
            }
            const selection =
              row.outcomeCode as SettlementCandidate["selection"];
            if (!SETTLEABLE_SELECTIONS[market.market].includes(selection)) {
              bump(skippedByReason, "SETTLEMENT_SELECTION_NOT_SETTLEABLE");
              continue;
            }
            candidates.push({
              decisionId: row.decisionId,
              market: market.market,
              selection,
            });
            ruleVersionByDecisionId.set(row.decisionId, market.ruleVersion);
          }

          const providerResult: ProviderFinalResult = {
            provider: result.provider,
            providerFixtureId: result.providerEventId,
            status: result.status,
            homeScore: result.homeScore,
            awayScore: result.awayScore,
            observedAt: result.providerObservedAt,
          };
          const instructions = orchestrateResultSettlement(
            providerResult,
            candidates,
          );
          const closingPrices = await closingPricesFor(scoped, rows);

          let settlements = 0;
          for (const instruction of instructions) {
            /*
             * UNSETTLED is not a settlement. It is what the engine answers
             * for a final match with no reported score, and persisting it
             * would claim the decision had been resolved.
             */
            if (instruction.outcome === "UNSETTLED") {
              bump(skippedByReason, "SETTLEMENT_OUTCOME_UNRESOLVED");
              continue;
            }
            const ruleVersion = ruleVersionByDecisionId.get(
              instruction.decisionId,
            );
            if (ruleVersion === undefined) continue;
            const closing = closingPrices.get(instruction.decisionId);
            const [row] = await transaction
              .insert(marketSettlements)
              .values({
                decisionId: instruction.decisionId,
                eventResultId: storedResult.id,
                outcome: instruction.outcome,
                settlementRuleVersion: ruleVersion,
                settledAt: new Date(instruction.observedAt),
                closingOdds: closing?.closingOdds ?? null,
                clv: closing?.clv ?? null,
              })
              .onConflictDoNothing({
                target: [
                  marketSettlements.decisionId,
                  marketSettlements.eventResultId,
                ],
              })
              .returning({ id: marketSettlements.id });
            if (row) settlements += 1;
          }
          return { reason: null, duplicate: false, settlements };
        },
      );

      if (outcome.reason !== null) {
        bump(skippedByReason, outcome.reason);
        continue;
      }
      if (outcome.duplicate) {
        duplicate += 1;
        continue;
      }
      written += 1;
      settlementsWritten += outcome.settlements;
    } catch (error) {
      /*
       * One fixture's failure must not discard the other nineteen in the
       * batch. The reason is surfaced so the ingestion funnel can name it
       * rather than reporting a silently short write.
       */
      bump(
        skippedByReason,
        error instanceof Error && error.message.startsWith("RESULT_")
          ? error.message
          : "RESULT_WRITE_FAILED",
      );
    }
  }

  return {
    received: input.results.length,
    written,
    duplicate,
    settlementsWritten,
    skippedByReason,
    statusByProviderFixtureId,
  };
}
