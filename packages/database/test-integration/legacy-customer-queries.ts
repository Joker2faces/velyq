// Frozen from dc16c3e for Task 14 semantic equivalence. Do not share production query helpers.
import { and, asc, desc, eq, gte, lt, lte } from "drizzle-orm";
import { canonicalMarketDefinitions } from "@velyq/market-semantics";

import type { PrivilegedVelyqDatabase } from "../src/client.js";
import {
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
} from "../src/schema/index.js";

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

export type CustomerRawToday = Readonly<{
  asOf: Date;
  windowStart: Date;
  windowEnd: Date;
  matches: readonly CustomerRawMatch[];
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
 * The `event_markets.code` values a customer surface may treat as the
 * match-result market.
 *
 * Derived from the canonical definition rather than spelled out. The customer
 * mapper used to look for `"MATCH_RESULT"` or `"1X2"`, and the live odds
 * writer creates rows with `canonicalMarketDefinitions
 * .FOOTBALL_FULL_TIME_1X2.code` -- that is `FOOTBALL_FULL_TIME_1X2`, while
 * `MATCH_RESULT` is only its *family* code and `"1X2"` appears nowhere in
 * production. So on live data neither branch ever matched and selection fell
 * through to "any outcome carrying evidence", which happens to be right today
 * only because one market is wired. Wiring a second (Over/Under 2.5 is
 * already supported everywhere except the writer) would have made it
 * non-deterministic.
 *
 * The family code and the bare `1X2` stay accepted: the seed and the database
 * integration fixtures use them, and dropping them would silently reclassify
 * existing rows.
 */
export const MATCH_RESULT_MARKET_CODES: readonly string[] = Object.freeze([
  canonicalMarketDefinitions.FOOTBALL_FULL_TIME_1X2.code,
  canonicalMarketDefinitions.FOOTBALL_FULL_TIME_1X2.familyCode,
  "1X2",
]);

const MAX_TODAY_EVENTS = 100;
const MAX_MATCH_MARKETS = 100;
const MAX_ODDS_HISTORY = 500;

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

/**
 * Which corpus a customer read is allowed to see.
 *
 * Required rather than defaulted: the storage form of `DataOrigin` lives in
 * `events.synthetic`, and a LIVE read that forgot to filter it would serve
 * fabricated football as real -- the exact failure the LIVE fail-closed work
 * removed from the service layer. A default here would let a future call
 * site reintroduce it silently, so every construction has to say which
 * corpus it means.
 */
export type CustomerQueryDataOrigin = "LIVE" | "SYNTHETIC_DEMO";

export type DatabaseCustomerQueryOptions = Readonly<{
  dataOrigin: CustomerQueryDataOrigin;
}>;

/** Read-only customer query adapter over the phase-one catalog/market/intelligence tables. */
export class LegacyCustomerQueryAdapter {
  constructor(
    private readonly database: ReadOnlyDatabase,
    private readonly options: DatabaseCustomerQueryOptions,
  ) {}

  /**
   * The corpus predicate, expressed exactly as the forecast cycle expresses
   * it (`forecast-cycle-adapter.ts`): synthetic rows are visible only to a
   * SYNTHETIC_DEMO read. Both paths therefore agree on what "live football"
   * means, rather than the customer path being the one place a synthetic
   * fixture can surface as real.
   */
  private get corpus() {
    return eq(events.synthetic, this.options.dataOrigin === "SYNTHETIC_DEMO");
  }

  /**
   * The bounded price history needed by customer opening/current semantics.
   *
   * The latest tail alone cannot define "opening": once more than
   * `MAX_ODDS_HISTORY` eligible rows exist, it becomes a rolling window. Read
   * the complete first provider instant separately, combine it with the
   * newest bounded tail, and de-duplicate the overlap for shorter histories.
   * Both component reads use the same exact outcome, corpus and two-clock
   * cutoff so neither side can admit evidence the other would reject.
   */
  private async getBoundedOddsHistory(
    eventMarketOutcomeId: string,
    asOf: Date,
  ): Promise<(typeof oddsObservations.$inferSelect)[]> {
    const observationCorpus = eq(
      oddsObservations.isSynthetic,
      this.options.dataOrigin === "SYNTHETIC_DEMO",
    );
    const eligible = and(
      eq(oddsObservations.eventMarketOutcomeId, eventMarketOutcomeId),
      eq(oddsObservations.status, "ACTIVE"),
      observationCorpus,
      lte(oddsObservations.providerObservedAt, asOf),
      lte(oddsObservations.receivedAt, asOf),
    );
    const earliestEligible = this.database
      .select({ providerObservedAt: oddsObservations.providerObservedAt })
      .from(oddsObservations)
      .where(eligible)
      .orderBy(
        asc(oddsObservations.providerObservedAt),
        asc(oddsObservations.id),
      )
      .limit(1)
      .as("earliest_eligible_odds");

    const [openingRows, latestTail] = await Promise.all([
      this.database
        .select({ observation: oddsObservations })
        .from(oddsObservations)
        .innerJoin(
          earliestEligible,
          eq(
            oddsObservations.providerObservedAt,
            earliestEligible.providerObservedAt,
          ),
        )
        .where(eligible)
        .orderBy(
          asc(oddsObservations.providerObservedAt),
          asc(oddsObservations.id),
        ),
      this.database
        .select()
        .from(oddsObservations)
        .where(eligible)
        .orderBy(
          desc(oddsObservations.providerObservedAt),
          desc(oddsObservations.id),
        )
        .limit(MAX_ODDS_HISTORY),
    ]);

    const byId = new Map<string, typeof oddsObservations.$inferSelect>();
    for (const observation of [
      ...openingRows.map((row) => row.observation),
      ...latestTail,
    ]) {
      byId.set(observation.id, observation);
    }
    return [...byId.values()].sort((left, right) => {
      const instant =
        left.providerObservedAt.getTime() - right.providerObservedAt.getTime();
      if (instant !== 0) return instant;
      return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
    });
  }

  async getToday(asOf: Date): Promise<CustomerRawToday> {
    const { start, end } = utcDayWindow(asOf);
    const rows = await this.database
      .select({ event: events })
      .from(events)
      .where(
        and(this.corpus, gte(events.startsAt, start), lt(events.startsAt, end)),
      )
      .orderBy(asc(events.startsAt), asc(events.id))
      .limit(MAX_TODAY_EVENTS);

    const matches = await Promise.all(
      rows.map(({ event }) => this.getMatch(event.id, asOf)),
    ).then((items): CustomerRawMatch[] =>
      items.filter((item): item is CustomerRawMatch => item !== null),
    );
    return { asOf, windowStart: start, windowEnd: end, matches };
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
      /*
       * The same corpus predicate as `getToday`. Without it a synthetic
       * fixture stays reachable in LIVE by its own id even once the list
       * hides it, which is a disclosed URL away from being the same defect.
       */
      .where(and(this.corpus, eq(events.id, eventId)))
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
      /*
       * Ordered by market identity, not by `eventMarkets.id`.
       *
       * That id is a random uuid, so ordering by it put the event's markets
       * in an arbitrary sequence that changed between rows being written --
       * invisible while one market existed per event, and a match page whose
       * sections reorder unpredictably as soon as two do. Family then code
       * then line is a stable, meaningful order, and the trailing id only
       * breaks ties that identity cannot.
       */
      .orderBy(
        asc(marketDefinitions.familyCode),
        asc(marketDefinitions.code),
        asc(eventMarkets.lineValue),
        asc(eventMarkets.id),
        asc(outcomeDefinitions.sortOrder),
      )
      .limit(MAX_MATCH_MARKETS);

    const outcomes = await Promise.all(
      marketRows.map(async (row): Promise<CustomerRawOutcome> => {
        /*
         * The four queries below have no data dependency on each other (only
         * predictionInputs depends on predictionRow, and radarEvidence on
         * score, each its own short chain) -- they used to run six fully
         * serial awaits per outcome, which is six round-trip latencies for
         * every outcome of every fixture on a page. Running the independent
         * chains concurrently does not change which rows are read or their
         * filters, only when the driver is asked for them.
         */
        const predictionChain = (async () => {
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
                  eq(
                    predictionInputs.predictionId,
                    predictionRow.prediction.id,
                  ),
                )
                .orderBy(
                  asc(predictionInputs.createdAt),
                  asc(predictionInputs.sourceObservationId),
                )
            : [];

          return { predictionRow, predictionInputRows };
        })();

        const qualityChain = this.database
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
          .limit(1)
          .then((rows) => rows[0]);

        const scoreChain = (async () => {
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

          return { score, evidence };
        })();

        /* Opening plus the bounded latest tail; the helper restores the
           stable chronological order expected by movement and freshness. */
        const oddsChain = this.getBoundedOddsHistory(row.outcome.id, asOf);

        const [
          { predictionRow, predictionInputRows },
          quality,
          { score, evidence },
          odds,
        ] = await Promise.all([
          predictionChain,
          qualityChain,
          scoreChain,
          oddsChain,
        ]);

        return {
          ...row,
          prediction: predictionRow ?? null,
          predictionInputs: predictionInputRows,
          quality: quality ?? null,
          score: score ? { result: score, radarEvidence: evidence } : null,
          odds,
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
      .innerJoin(events, eq(eventMarkets.eventId, events.id))
      .where(
        and(
          this.corpus,
          eq(eventMarkets.eventId, eventId),
          eq(eventMarketOutcomes.id, eventMarketOutcomeId),
        ),
      )
      .limit(1);
    if (!ownership) return null;

    /* Same opening-plus-tail discipline as the match read. */
    const rows = await this.getBoundedOddsHistory(eventMarketOutcomeId, asOf);
    return {
      eventId: ownership.eventId,
      eventMarketOutcomeId: ownership.outcomeId,
      asOf,
      observations: rows,
    };
  }
}
