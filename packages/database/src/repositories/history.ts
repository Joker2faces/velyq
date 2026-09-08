import { asc, desc, eq } from "drizzle-orm";
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

/** All immutable decisions, ordered newest-first; filtering winners is impossible at this boundary. */
export class DatabaseHistoryQueryAdapter {
  constructor(private readonly database: PrivilegedVelyqDatabase) {}
  async listDecisions(limit = 500): Promise<readonly HistoricalDecisionRow[]> {
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
      .where(eq(decisions.status, "STRONG_EDGE"))
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
}
