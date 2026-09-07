import { and, asc, count, desc, eq, gte, inArray, lt, lte } from "drizzle-orm";

import type { PrivilegedVelyqDatabase } from "../client.js";
import {
  competitionPolicies,
  competitions,
  eventMarketOutcomes,
  eventMarkets,
  eventParticipants,
  events,
  marketDefinitions,
  oddsObservations,
  outcomeDefinitions,
  participants,
  predictionRuns,
  predictionInputs,
  predictions,
  radarEvidence,
  scoreResults,
  sports,
  dataQualityAssessments,
  lineupObservations,
} from "../schema/index.js";

/** The deliberately un-mapped database read model consumed by an application mapper. */
export type CustomerRawParticipant = Readonly<{
  participant: typeof participants.$inferSelect;
  eventParticipant: typeof eventParticipants.$inferSelect;
}>;

export type CustomerRawOutcome = Readonly<{
  market: typeof eventMarkets.$inferSelect;
  marketDefinition: typeof marketDefinitions.$inferSelect;
  outcome: typeof eventMarketOutcomes.$inferSelect;
  outcomeDefinition: typeof outcomeDefinitions.$inferSelect;
  prediction: Readonly<{
    prediction: typeof predictions.$inferSelect;
    run: typeof predictionRuns.$inferSelect;
  }> | null;
  predictionInputs: readonly (typeof predictionInputs.$inferSelect)[];
  quality: typeof dataQualityAssessments.$inferSelect | null;
  score: Readonly<{
    result: typeof scoreResults.$inferSelect;
    radarEvidence: typeof radarEvidence.$inferSelect | null;
  }> | null;
  odds: readonly (typeof oddsObservations.$inferSelect)[];
}>;

export type CustomerRawMatch = Readonly<{
  event: typeof events.$inferSelect;
  sport: typeof sports.$inferSelect;
  competition: typeof competitions.$inferSelect;
  participants: readonly CustomerRawParticipant[];
  lineups: readonly (typeof lineupObservations.$inferSelect)[];
  outcomes: readonly CustomerRawOutcome[];
  asOf: Date;
}>;

/**
 * Why events the provider delivered are not in this list.
 *
 * A count and a set of reason codes rather than the events themselves. The
 * alternative — rendering every unmodelled fixture with an "insufficient
 * data" badge — fills the page with dozens of identical rows that say nothing,
 * and buries the handful of events the model actually has an opinion about.
 * Administrators can still inspect every suppressed event individually; a
 * customer gets the count and the reasons.
 */
export type CustomerSuppressionSummary = Readonly<{
  total: number;
  byReason: Readonly<Record<string, number>>;
}>;

/**
 * How much of the eligible universe this response actually carries.
 *
 * Reported rather than implied. A page cap is a legitimate way to keep a
 * response bounded; presenting the capped page as if it were the whole window
 * is not, and it is the failure mode that makes a suppression count quietly
 * wrong — count the first hundred fixtures, show the forty that qualify, and
 * report "sixty suppressed" when the real window held three hundred.
 */
export type CustomerUniverseCoverage = Readonly<{
  /** Every event in the window, before any eligibility filtering. */
  eventsInWindow: number;
  /** Events whose competition policy makes them customer-visible. */
  eligible: number;
  /** Eligible events carried in `matches` — never more than `pageSize`. */
  returned: number;
  pageSize: number;
  truncated: boolean;
}>;

export type CustomerRawToday = Readonly<{
  asOf: Date;
  windowStart: Date;
  windowEnd: Date;
  matches: readonly CustomerRawMatch[];
  suppressed: CustomerSuppressionSummary;
  coverage: CustomerUniverseCoverage;
}>;

/**
 * Which slice of the provider's universe to read.
 *
 * INTELLIGENCE is the default and the only one a customer surface should use
 * unqualified: competitions whose policy makes them customer-visible. ALL is
 * the secondary "everything tracked" view, and it is still bounded by the
 * horizon — it is not a raw dump of the provider.
 */
export type CustomerTodayScope = "INTELLIGENCE" | "ALL";

export type CustomerTodayOptions = Readonly<{
  scope?: CustomerTodayScope;
  /** Defaults to today plus tomorrow. */
  horizonHours?: number;
}>;

export type CustomerRawOddsHistory = Readonly<{
  eventId: string;
  eventMarketOutcomeId: string;
  asOf: Date;
  observations: readonly (typeof oddsObservations.$inferSelect)[];
}>;

/**
 * Explicit application boundary: this package returns database-shaped reads only.
 * DTO/localization/ownership mapping belongs in the application or BFF layer.
 */
export interface CustomerReadModelMapper<TOutput> {
  mapToday(read: CustomerRawToday): TOutput;
  mapMatch(read: CustomerRawMatch): TOutput;
  mapOddsHistory(read: CustomerRawOddsHistory): TOutput;
}

type ReadOnlyDatabase = Pick<PrivilegedVelyqDatabase, "select">;

/**
 * The page cap on returned matches.
 *
 * It bounds the response, not the counts. Every number in `suppressed` and
 * `coverage` is a full aggregate over the window, computed in the database
 * before this cap applies, so a truncated page still reports the true size of
 * what it truncated.
 */
const MAX_TODAY_EVENTS = 100;

/**
 * Today and tomorrow, not the whole provider.
 *
 * The customer workspace answers "what should I be looking at now". A window
 * that reaches further turns it into a fixture list, and the intelligence for
 * a match four days out is mostly stale by kickoff anyway.
 */
const DEFAULT_HORIZON_HOURS = 48;

/**
 * The competition states whose events may become customer intelligence.
 *
 * EXPERIMENTAL, ADMIN_ONLY and EXCLUDED are all deliberately absent, and an
 * event whose competition has no policy row at all is absent too — the
 * resolver fails closed rather than guessing, so a competition nobody has
 * reviewed is never shown.
 */
const CUSTOMER_VISIBLE_STATES = ["PRIME", "SUPPORTED"] as const;
const MAX_MATCH_MARKETS = 100;
const MAX_ODDS_HISTORY = 500;

/**
 * Why a group of events is not customer intelligence, or null when it is.
 *
 * One expression, shared by the aggregate that counts suppressions and
 * mirrored by the SQL filter that applies them, so the reported reason and
 * the applied rule cannot drift apart.
 */
export function suppressionReason(
  group: Readonly<{
    canonicalCode: string | null;
    state: string | null;
    customerVisible: boolean | null;
  }>,
): string | null {
  if (group.canonicalCode === null || group.state === null)
    return "COMPETITION_NOT_IN_POLICY";
  if (
    group.customerVisible !== true ||
    !CUSTOMER_VISIBLE_STATES.includes(
      group.state as (typeof CUSTOMER_VISIBLE_STATES)[number],
    )
  )
    return `COMPETITION_${group.state}`;
  return null;
}

export function utcDayWindow(asOf: Date): Readonly<{
  start: Date;
  end: Date;
}> {
  const start = new Date(asOf);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

/** Read-only customer query adapter over the phase-one catalog/market/intelligence tables. */
export class DatabaseCustomerQueryAdapter {
  constructor(private readonly database: ReadOnlyDatabase) {}

  async getToday(
    asOf: Date,
    options: CustomerTodayOptions = {},
  ): Promise<CustomerRawToday> {
    const scope = options.scope ?? "INTELLIGENCE";
    const { start } = utcDayWindow(asOf);
    const end = new Date(
      start.getTime() +
        (options.horizonHours ?? DEFAULT_HORIZON_HOURS) * 3_600_000,
    );

    /*
     * The competition's eligibility travels with the event, so the decision
     * about what a customer may see is made in one place from policy data
     * rather than re-derived per surface. `canonicalCode` is nullable and a
     * left join keeps those events visible to the ALL scope while the state
     * check below excludes them from the intelligence view.
     */
    const window = and(gte(events.startsAt, start), lt(events.startsAt, end));

    /*
     * The counts come first, as a grouped aggregate over the entire window.
     * Counting the rows a paged query happened to return would make every
     * summary a function of the page size, which is the one thing a summary
     * must not be.
     */
    const grouped = await this.database
      .select({
        canonicalCode: competitions.canonicalCode,
        state: competitionPolicies.state,
        customerVisible: competitionPolicies.customerVisible,
        total: count(),
      })
      .from(events)
      .innerJoin(competitions, eq(events.competitionId, competitions.id))
      .leftJoin(
        competitionPolicies,
        eq(competitionPolicies.canonicalCode, competitions.canonicalCode),
      )
      .where(window)
      .groupBy(
        competitions.canonicalCode,
        competitionPolicies.state,
        competitionPolicies.customerVisible,
      );

    let eventsInWindow = 0;
    let eligible = 0;
    const byReason: Record<string, number> = {};
    for (const group of grouped) {
      eventsInWindow += group.total;
      const reason = scope === "ALL" ? null : suppressionReason(group);
      if (reason === null) {
        eligible += group.total;
        continue;
      }
      byReason[reason] = (byReason[reason] ?? 0) + group.total;
    }

    /*
     * Then the page, filtered in SQL rather than in memory. Filtering after
     * the limit is what previously let a window full of unmodelled fixtures
     * crowd every eligible one off the page.
     */
    const rows = await this.database
      .select({ event: events })
      .from(events)
      .innerJoin(competitions, eq(events.competitionId, competitions.id))
      .leftJoin(
        competitionPolicies,
        eq(competitionPolicies.canonicalCode, competitions.canonicalCode),
      )
      .where(
        scope === "ALL"
          ? window
          : and(
              window,
              eq(competitionPolicies.customerVisible, true),
              inArray(competitionPolicies.state, [...CUSTOMER_VISIBLE_STATES]),
            ),
      )
      /*
       * Relevance is kickoff proximity. Inside a 48-hour window the match
       * starting soonest is the one a customer can still act on, and a
       * cleverer ranking would order the page by a quantity the reader
       * cannot see.
       */
      .orderBy(asc(events.startsAt), asc(events.id))
      .limit(MAX_TODAY_EVENTS);

    const matches = await Promise.all(
      rows.map(({ event }) => this.getMatch(event.id, asOf)),
    ).then((items): CustomerRawMatch[] =>
      items.filter((item): item is CustomerRawMatch => item !== null),
    );
    return {
      asOf,
      windowStart: start,
      windowEnd: end,
      matches,
      suppressed: {
        total: eventsInWindow - eligible,
        byReason,
      },
      coverage: {
        eventsInWindow,
        eligible,
        returned: rows.length,
        pageSize: MAX_TODAY_EVENTS,
        truncated: eligible > rows.length,
      },
    };
  }

  async getMatch(
    eventId: string,
    asOf: Date,
  ): Promise<CustomerRawMatch | null> {
    const [eventRow] = await this.database
      .select({ event: events, sport: sports, competition: competitions })
      .from(events)
      .innerJoin(sports, eq(events.sportId, sports.id))
      .innerJoin(competitions, eq(events.competitionId, competitions.id))
      .where(eq(events.id, eventId))
      .limit(1);
    if (!eventRow) return null;

    const participantRows = await this.database
      .select({
        participant: participants,
        eventParticipant: eventParticipants,
      })
      .from(eventParticipants)
      .innerJoin(
        participants,
        eq(eventParticipants.participantId, participants.id),
      )
      .where(eq(eventParticipants.eventId, eventId))
      .orderBy(asc(eventParticipants.role), asc(participants.id));

    const lineups = await this.database
      .select()
      .from(lineupObservations)
      .where(
        and(
          eq(lineupObservations.eventId, eventId),
          lte(lineupObservations.providerObservedAt, asOf),
          lte(lineupObservations.receivedAt, asOf),
        ),
      )
      .orderBy(
        desc(lineupObservations.providerObservedAt),
        asc(lineupObservations.id),
      );

    const marketRows = await this.database
      .select({
        market: eventMarkets,
        marketDefinition: marketDefinitions,
        outcome: eventMarketOutcomes,
        outcomeDefinition: outcomeDefinitions,
      })
      .from(eventMarkets)
      .innerJoin(
        marketDefinitions,
        eq(eventMarkets.marketDefinitionId, marketDefinitions.id),
      )
      .innerJoin(
        eventMarketOutcomes,
        eq(eventMarketOutcomes.eventMarketId, eventMarkets.id),
      )
      .innerJoin(
        outcomeDefinitions,
        eq(eventMarketOutcomes.outcomeDefinitionId, outcomeDefinitions.id),
      )
      .where(eq(eventMarkets.eventId, eventId))
      .orderBy(asc(eventMarkets.id), asc(outcomeDefinitions.sortOrder))
      .limit(MAX_MATCH_MARKETS);

    const outcomes = await Promise.all(
      marketRows.map(async (row): Promise<CustomerRawOutcome> => {
        const [predictionRow] = await this.database
          .select({ prediction: predictions, run: predictionRuns })
          .from(predictions)
          .innerJoin(
            predictionRuns,
            eq(predictions.predictionRunId, predictionRuns.id),
          )
          .where(
            and(
              eq(predictions.eventMarketOutcomeId, row.outcome.id),
              lte(predictions.createdAt, asOf),
              lte(predictionRuns.featureCutoff, asOf),
            ),
          )
          .orderBy(desc(predictions.createdAt), desc(predictions.id))
          .limit(1);

        const predictionInputRows = predictionRow
          ? await this.database
              .select()
              .from(predictionInputs)
              .where(
                eq(predictionInputs.predictionId, predictionRow.prediction.id),
              )
              .orderBy(
                asc(predictionInputs.createdAt),
                asc(predictionInputs.sourceObservationId),
              )
          : [];

        const [quality] = await this.database
          .select()
          .from(dataQualityAssessments)
          .where(
            and(
              eq(dataQualityAssessments.eventId, eventId),
              eq(dataQualityAssessments.marketOutcomeId, row.outcome.id),
              lte(dataQualityAssessments.asOf, asOf),
            ),
          )
          .orderBy(
            desc(dataQualityAssessments.asOf),
            desc(dataQualityAssessments.id),
          )
          .limit(1);

        const [score] = await this.database
          .select()
          .from(scoreResults)
          .where(
            and(
              eq(scoreResults.eventMarketOutcomeId, row.outcome.id),
              lte(scoreResults.asOf, asOf),
            ),
          )
          .orderBy(
            desc(scoreResults.asOf),
            desc(scoreResults.createdAt),
            desc(scoreResults.id),
          )
          .limit(1);

        const evidence = score
          ? ((
              await this.database
                .select()
                .from(radarEvidence)
                .where(eq(radarEvidence.scoreResultId, score.id))
                .limit(1)
            )[0] ?? null)
          : null;

        const odds = await this.database
          .select()
          .from(oddsObservations)
          .innerJoin(
            eventMarketOutcomes,
            eq(oddsObservations.eventMarketOutcomeId, eventMarketOutcomes.id),
          )
          .where(
            and(
              eq(eventMarketOutcomes.id, row.outcome.id),
              lte(oddsObservations.providerObservedAt, asOf),
              lte(oddsObservations.receivedAt, asOf),
            ),
          )
          .orderBy(
            asc(oddsObservations.providerObservedAt),
            asc(oddsObservations.id),
          )
          .limit(MAX_ODDS_HISTORY);

        return {
          ...row,
          prediction: predictionRow ?? null,
          predictionInputs: predictionInputRows,
          quality: quality ?? null,
          score: score ? { result: score, radarEvidence: evidence } : null,
          odds: odds.map(({ odds_observations: observation }) => observation),
        };
      }),
    );

    return {
      ...eventRow,
      participants: participantRows,
      lineups,
      outcomes,
      asOf,
    };
  }

  async getOddsHistory(
    eventId: string,
    eventMarketOutcomeId: string,
    asOf: Date,
  ): Promise<CustomerRawOddsHistory | null> {
    const [ownership] = await this.database
      .select({
        eventId: eventMarkets.eventId,
        outcomeId: eventMarketOutcomes.id,
      })
      .from(eventMarketOutcomes)
      .innerJoin(
        eventMarkets,
        eq(eventMarketOutcomes.eventMarketId, eventMarkets.id),
      )
      .where(
        and(
          eq(eventMarkets.eventId, eventId),
          eq(eventMarketOutcomes.id, eventMarketOutcomeId),
        ),
      )
      .limit(1);
    if (!ownership) return null;

    const rows = await this.database
      .select()
      .from(oddsObservations)
      .where(
        and(
          eq(oddsObservations.eventMarketOutcomeId, eventMarketOutcomeId),
          lte(oddsObservations.providerObservedAt, asOf),
          lte(oddsObservations.receivedAt, asOf),
        ),
      )
      .orderBy(
        asc(oddsObservations.providerObservedAt),
        asc(oddsObservations.id),
      );
    return {
      eventId: ownership.eventId,
      eventMarketOutcomeId: ownership.outcomeId,
      asOf,
      observations: rows,
    };
  }
}
