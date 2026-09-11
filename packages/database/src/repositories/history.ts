import { and, asc, desc, eq, lt, or, sql } from "drizzle-orm";
import type { PrivilegedVelyqDatabase } from "../client.js";
import {
  competitions,
  eventParticipants,
  events,
  participants,
} from "../schema/catalog.js";
import {
  dataQualityAssessments,
  dataQualityPolicyVersions,
  decisions,
  eventResults,
  forecasts,
  marketSettlements,
  predictions,
} from "../schema/intelligence.js";
import {
  eventMarketOutcomes,
  eventMarkets,
  marketDefinitions,
  outcomeDefinitions,
} from "../schema/market.js";
import { sourceObservations } from "../schema/operations.js";

export type HistoricalDecisionRow = Readonly<{
  decision: typeof decisions.$inferSelect;
  forecast: typeof forecasts.$inferSelect;
  qualityAssessment: typeof dataQualityAssessments.$inferSelect | null;
  qualityPolicy: Readonly<{ code: string; version: string }> | null;
  event: typeof events.$inferSelect;
  competition: typeof competitions.$inferSelect;
  marketDefinition: typeof marketDefinitions.$inferSelect;
  outcomeDefinition: typeof outcomeDefinitions.$inferSelect;
  settlement: typeof marketSettlements.$inferSelect | null;
  result: typeof eventResults.$inferSelect | null;
  homeTeam: string;
  awayTeam: string;
}>;

/**
 * A page's own cursor: the last row's millisecond timestamp and id ordering
 * key, to ask for what comes after it.
 */
export type HistoryCursor = Readonly<{ createdAt: Date; id: string }>;

/* node-postgres materializes timestamptz as a millisecond-precision Date.
   Use that exact precision in SQL too, so ordering and the next request's
   comparison describe the same equivalence class. */
const decisionCreatedAtMillis = sql<Date>`date_trunc('milliseconds', ${decisions.createdAt})`;

/**
 * One correction-safe settlement key per decision. Provider observation time
 * is the authority when known; otherwise acquisition orders the responses.
 * Persisted timestamps and UUIDs make equal observations
 * deterministic without rewriting any audit row.
 */
function authoritativeSettlementIds(database: PrivilegedVelyqDatabase) {
  return database
    .selectDistinctOn([marketSettlements.decisionId], {
      decisionId: marketSettlements.decisionId,
      settlementId: marketSettlements.id,
    })
    .from(marketSettlements)
    .innerJoin(
      eventResults,
      eq(marketSettlements.eventResultId, eventResults.id),
    )
    .innerJoin(
      sourceObservations,
      eq(eventResults.sourceObservationId, sourceObservations.id),
    )
    .orderBy(
      asc(marketSettlements.decisionId),
      desc(
        sql`coalesce(${eventResults.providerObservedAt}, ${sourceObservations.receivedAt})`,
      ),
      desc(eventResults.createdAt),
      desc(eventResults.id),
      desc(marketSettlements.createdAt),
      desc(marketSettlements.id),
    )
    .as("authoritative_settlement_ids");
}

/**
 * All immutable decisions in the required corpus, ordered newest-first;
 * filtering winners is impossible at this boundary.
 */
export class DatabaseHistoryQueryAdapter {
  constructor(private readonly database: PrivilegedVelyqDatabase) {}
  async listDecisions(
    limit: number,
    before: HistoryCursor | undefined,
    synthetic: boolean,
  ): Promise<readonly HistoricalDecisionRow[]> {
    /*
     * Keyset pagination on the same (millisecond createdAt, id) pair the query
     * orders by, not OFFSET: an offset re-scans and re-sorts everything before
     * the requested page on every request, and a decision inserted between two
     * page loads would shift every later page by one row -- silently
     * duplicating or skipping a row the customer had already seen. The
     * compound "strictly before this row" comparison has neither problem.
     */
    const cursorClause = before
      ? or(
          lt(decisionCreatedAtMillis, before.createdAt),
          and(
            eq(decisionCreatedAtMillis, before.createdAt),
            lt(decisions.id, before.id),
          ),
        )
      : undefined;
    const latestSettlements = authoritativeSettlementIds(this.database);
    const rows = await this.database
      .select({
        decision: decisions,
        forecast: forecasts,
        qualityAssessment: dataQualityAssessments,
        qualityPolicy: {
          code: dataQualityPolicyVersions.code,
          version: dataQualityPolicyVersions.version,
        },
        event: events,
        competition: competitions,
        marketDefinition: marketDefinitions,
        outcomeDefinition: outcomeDefinitions,
        settlement: marketSettlements,
        result: eventResults,
      })
      .from(decisions)
      .innerJoin(forecasts, eq(decisions.forecastId, forecasts.id))
      .leftJoin(predictions, eq(forecasts.predictionId, predictions.id))
      .leftJoin(
        dataQualityAssessments,
        eq(predictions.dataQualityAssessmentId, dataQualityAssessments.id),
      )
      .leftJoin(
        dataQualityPolicyVersions,
        eq(
          dataQualityAssessments.policyVersionId,
          dataQualityPolicyVersions.id,
        ),
      )
      .innerJoin(
        eventMarketOutcomes,
        eq(decisions.eventMarketOutcomeId, eventMarketOutcomes.id),
      )
      .innerJoin(
        eventMarkets,
        eq(eventMarketOutcomes.eventMarketId, eventMarkets.id),
      )
      .innerJoin(
        marketDefinitions,
        eq(eventMarkets.marketDefinitionId, marketDefinitions.id),
      )
      .innerJoin(
        outcomeDefinitions,
        eq(eventMarketOutcomes.outcomeDefinitionId, outcomeDefinitions.id),
      )
      .innerJoin(events, eq(eventMarkets.eventId, events.id))
      .innerJoin(competitions, eq(events.competitionId, competitions.id))
      .leftJoin(
        latestSettlements,
        eq(latestSettlements.decisionId, decisions.id),
      )
      .leftJoin(
        marketSettlements,
        eq(marketSettlements.id, latestSettlements.settlementId),
      )
      .leftJoin(
        eventResults,
        eq(marketSettlements.eventResultId, eventResults.id),
      )
      .where(
        and(
          eq(decisions.status, "STRONG_EDGE"),
          eq(events.synthetic, synthetic),
          cursorClause,
        ),
      )
      .orderBy(desc(decisionCreatedAtMillis), desc(decisions.id))
      .limit(limit);
    return Promise.all(
      rows.map(async (row) => {
        const teams = await this.database
          .select({
            role: eventParticipants.role,
            name: participants.displayName,
          })
          .from(eventParticipants)
          .innerJoin(
            participants,
            eq(eventParticipants.participantId, participants.id),
          )
          .where(eq(eventParticipants.eventId, row.event.id))
          .orderBy(asc(eventParticipants.role));
        return {
          ...row,
          homeTeam: teams.find((team) => team.role === "HOME")?.name ?? "Home",
          awayTeam: teams.find((team) => team.role === "AWAY")?.name ?? "Away",
        };
      }),
    );
  }

  /**
   * Every decision this fixture ever had -- not just the STRONG_EDGE ones
   * `listDecisions` restricts itself to -- for the post-match autopsy. Same
   * join chain as `listDecisions` (decision -> forecast -> market/outcome
   * definitions -> event/competition -> settlement -> result), scoped to one
   * event instead of paged by recency, since a fixture only ever has a
   * handful of decisions across its markets.
   */
  /**
   * `synthetic` is required, not defaulted, on purpose -- the same
   * discipline `DatabaseCustomerQueryAdapter`'s `corpus` predicate already
   * applies. Omitting it would let a caller pass any event id at all and
   * get a real answer regardless of which corpus (LIVE vs SYNTHETIC_DEMO)
   * it actually belongs to, which is exactly the defect the customer read
   * path was built to prevent everywhere else.
   */
  async listDecisionsForEvent(
    eventId: string,
    synthetic: boolean,
  ): Promise<readonly HistoricalDecisionRow[]> {
    const latestSettlements = authoritativeSettlementIds(this.database);
    const rows = await this.database
      .select({
        decision: decisions,
        forecast: forecasts,
        qualityAssessment: dataQualityAssessments,
        qualityPolicy: {
          code: dataQualityPolicyVersions.code,
          version: dataQualityPolicyVersions.version,
        },
        event: events,
        competition: competitions,
        marketDefinition: marketDefinitions,
        outcomeDefinition: outcomeDefinitions,
        settlement: marketSettlements,
        result: eventResults,
      })
      .from(decisions)
      .innerJoin(forecasts, eq(decisions.forecastId, forecasts.id))
      .leftJoin(predictions, eq(forecasts.predictionId, predictions.id))
      .leftJoin(
        dataQualityAssessments,
        eq(predictions.dataQualityAssessmentId, dataQualityAssessments.id),
      )
      .leftJoin(
        dataQualityPolicyVersions,
        eq(
          dataQualityAssessments.policyVersionId,
          dataQualityPolicyVersions.id,
        ),
      )
      .innerJoin(
        eventMarketOutcomes,
        eq(decisions.eventMarketOutcomeId, eventMarketOutcomes.id),
      )
      .innerJoin(
        eventMarkets,
        eq(eventMarketOutcomes.eventMarketId, eventMarkets.id),
      )
      .innerJoin(
        marketDefinitions,
        eq(eventMarkets.marketDefinitionId, marketDefinitions.id),
      )
      .innerJoin(
        outcomeDefinitions,
        eq(eventMarketOutcomes.outcomeDefinitionId, outcomeDefinitions.id),
      )
      .innerJoin(events, eq(eventMarkets.eventId, events.id))
      .innerJoin(competitions, eq(events.competitionId, competitions.id))
      .leftJoin(
        latestSettlements,
        eq(latestSettlements.decisionId, decisions.id),
      )
      .leftJoin(
        marketSettlements,
        eq(marketSettlements.id, latestSettlements.settlementId),
      )
      .leftJoin(
        eventResults,
        eq(marketSettlements.eventResultId, eventResults.id),
      )
      .where(and(eq(events.id, eventId), eq(events.synthetic, synthetic)))
      .orderBy(desc(decisions.createdAt), desc(decisions.id));

    const teams = await this.database
      .select({ role: eventParticipants.role, name: participants.displayName })
      .from(eventParticipants)
      .innerJoin(
        participants,
        eq(eventParticipants.participantId, participants.id),
      )
      .where(eq(eventParticipants.eventId, eventId))
      .orderBy(asc(eventParticipants.role));
    const homeTeam = teams.find((team) => team.role === "HOME")?.name ?? "Home";
    const awayTeam = teams.find((team) => team.role === "AWAY")?.name ?? "Away";

    return rows.map((row) => ({ ...row, homeTeam, awayTeam }));
  }
}
