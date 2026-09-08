import { and, eq, gte, lt, ne } from "drizzle-orm";

import type { PrivilegedVelyqDatabase } from "../client.js";
import { events, sports } from "../schema/catalog.js";
import { eventMarketOutcomes, eventMarkets } from "../schema/market.js";
import { predictions } from "../schema/intelligence.js";

export type ForecastCoverageDiagnostic = Readonly<{
  windowStart: string;
  windowEnd: string;
  totalEvents: number;
  eventsWithAnyPrediction: number;
  eventsWithNoPrediction: number;
  predictionsByDecisionStatus: Readonly<Record<string, number>>;
}>;

/**
 * A read-only, admin-safe snapshot of current forecast coverage for a time
 * window -- "how many of today's fixtures actually have a forecast, and
 * what did we decide about them" -- from persisted state alone, without
 * re-running the cycle.
 *
 * Deliberately does NOT attempt to report why an uncovered event has no
 * prediction (COMPETITION_NOT_IN_MODEL, TEAM_NOT_IN_MODEL, etc.): those
 * reason codes are `runForecastCycle`'s own transient per-run summary
 * (`skippedByReason`), never persisted anywhere a later read could recover
 * them for an event the cycle skipped entirely. Getting that breakdown
 * requires actually running the cycle (see the /api/internal/
 * forecast-cycle trigger's response) -- this diagnostic only answers
 * "what is true right now", not "why".
 */
export async function getForecastCoverageDiagnostic(
  database: PrivilegedVelyqDatabase,
  window: Readonly<{ from: Date; to: Date }>,
): Promise<ForecastCoverageDiagnostic> {
  const eventRows = await database
    .select({ id: events.id })
    .from(events)
    .innerJoin(sports, eq(events.sportId, sports.id))
    .where(
      and(
        eq(sports.code, "FOOTBALL"),
        gte(events.startsAt, window.from),
        lt(events.startsAt, window.to),
        ne(events.status, "CANCELLED"),
        ne(events.status, "ABANDONED"),
      ),
    );
  const eventIds = new Set(eventRows.map((row) => row.id));

  const predictionRows = await database
    .select({
      eventId: eventMarkets.eventId,
      decisionStatus: predictions.decisionStatus,
    })
    .from(predictions)
    .innerJoin(
      eventMarketOutcomes,
      eq(predictions.eventMarketOutcomeId, eventMarketOutcomes.id),
    )
    .innerJoin(
      eventMarkets,
      eq(eventMarketOutcomes.eventMarketId, eventMarkets.id),
    );

  const relevant = predictionRows.filter((row) => eventIds.has(row.eventId));
  const eventsWithPrediction = new Set(relevant.map((row) => row.eventId));

  const predictionsByDecisionStatus: Record<string, number> = {};
  for (const row of relevant) {
    predictionsByDecisionStatus[row.decisionStatus] =
      (predictionsByDecisionStatus[row.decisionStatus] ?? 0) + 1;
  }

  return {
    windowStart: window.from.toISOString(),
    windowEnd: window.to.toISOString(),
    totalEvents: eventIds.size,
    eventsWithAnyPrediction: eventsWithPrediction.size,
    eventsWithNoPrediction: eventIds.size - eventsWithPrediction.size,
    predictionsByDecisionStatus,
  };
}
