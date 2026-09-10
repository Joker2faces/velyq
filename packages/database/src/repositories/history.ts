import { and, asc, desc, eq, lt, or } from "drizzle-orm";
import type { PrivilegedVelyqDatabase } from "../client.js";
import {
  competitions,
  eventParticipants,
  events,
  participants,
} from "../schema/catalog.js";
import {
  decisions,
  eventResults,
  forecasts,
  marketSettlements,
} from "../schema/intelligence.js";
import {
  eventMarketOutcomes,
  eventMarkets,
  marketDefinitions,
  outcomeDefinitions,
} from "../schema/market.js";

export type HistoricalDecisionRow = Readonly<{
  decision: typeof decisions.$inferSelect;
  forecast: typeof forecasts.$inferSelect;
  event: typeof events.$inferSelect;
  competition: typeof competitions.$inferSelect;
  marketDefinition: typeof marketDefinitions.$inferSelect;
  outcomeDefinition: typeof outcomeDefinitions.$inferSelect;
  settlement: typeof marketSettlements.$inferSelect | null;
  result: typeof eventResults.$inferSelect | null;
  homeTeam: string;
  awayTeam: string;
}>;

/** A page's own cursor: the last row's ordering key, to ask for what comes after it. */
export type HistoryCursor = Readonly<{ createdAt: Date; id: string }>;

/** All immutable decisions, ordered newest-first; filtering winners is impossible at this boundary. */
export class DatabaseHistoryQueryAdapter {
  constructor(private readonly database: PrivilegedVelyqDatabase) {}
  async listDecisions(
    limit = 500,
    before?: HistoryCursor,
  ): Promise<readonly HistoricalDecisionRow[]> {
    /*
     * Keyset pagination on the same (createdAt, id) pair the query already
     * orders by, not OFFSET: an offset re-scans and re-sorts everything
     * before the requested page on every request, and a decision inserted
     * between two page loads would shift every later page by one row --
     * silently duplicating or skipping a row the customer had already seen.
     * The compound "strictly before this row" comparison has neither
     * problem.
     */
    const cursorClause = before
      ? or(
          lt(decisions.createdAt, before.createdAt),
          and(
            eq(decisions.createdAt, before.createdAt),
            lt(decisions.id, before.id),
          ),
        )
      : undefined;
    const rows = await this.database
      .select({
        decision: decisions,
        forecast: forecasts,
        event: events,
        competition: competitions,
        marketDefinition: marketDefinitions,
        outcomeDefinition: outcomeDefinitions,
        settlement: marketSettlements,
        result: eventResults,
      })
      .from(decisions)
      .innerJoin(forecasts, eq(decisions.forecastId, forecasts.id))
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
        marketSettlements,
        eq(marketSettlements.decisionId, decisions.id),
      )
      .leftJoin(
        eventResults,
        eq(marketSettlements.eventResultId, eventResults.id),
      )
      .where(
        cursorClause
          ? and(eq(decisions.status, "STRONG_EDGE"), cursorClause)
          : eq(decisions.status, "STRONG_EDGE"),
      )
      .orderBy(
        desc(decisions.createdAt),
        desc(decisions.id),
        desc(marketSettlements.settledAt),
      )
      .limit(limit);
    const latestRows = rows.filter(
      (row, index) =>
        rows.findIndex(
          (candidate) => candidate.decision.id === row.decision.id,
        ) === index,
    );
    return Promise.all(
      latestRows.map(async (row) => {
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
    const rows = await this.database
      .select({
        decision: decisions,
        forecast: forecasts,
        event: events,
        competition: competitions,
        marketDefinition: marketDefinitions,
        outcomeDefinition: outcomeDefinitions,
        settlement: marketSettlements,
        result: eventResults,
      })
      .from(decisions)
      .innerJoin(forecasts, eq(decisions.forecastId, forecasts.id))
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
        marketSettlements,
        eq(marketSettlements.decisionId, decisions.id),
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

    /* One decision id can appear twice via the settlement/result left joins
       only if a decision were re-settled, which the writer forbids; kept as
       a safety filter anyway rather than assumed. */
    const latestRows = rows.filter(
      (row, index) =>
        rows.findIndex(
          (candidate) => candidate.decision.id === row.decision.id,
        ) === index,
    );
    return latestRows.map((row) => ({ ...row, homeTeam, awayTeam }));
  }
}
