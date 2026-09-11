import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  lt,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { canonicalMarketDefinitions } from "@velyq/market-semantics";

import type { PrivilegedVelyqDatabase } from "../client.js";
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
export class DatabaseCustomerQueryAdapter {
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

  /** Rank only eligible rows: complete opening instant plus newest 500 per outcome. */
  private async getBulkOddsHistory(outcomeIds: readonly string[], asOf: Date) {
    if (outcomeIds.length === 0) return [];
    const ranked = this.database
      .select({
        id: oddsObservations.id,
        position:
          sql<number>`row_number() over (partition by ${oddsObservations.eventMarketOutcomeId} order by ${oddsObservations.providerObservedAt} desc, ${oddsObservations.id} desc)`.as(
            "position",
          ),
        opening:
          sql<Date>`min(${oddsObservations.providerObservedAt}) over (partition by ${oddsObservations.eventMarketOutcomeId})`.as(
            "opening",
          ),
      })
      .from(oddsObservations)
      .where(
        and(
          inArray(oddsObservations.eventMarketOutcomeId, [...outcomeIds]),
          eq(oddsObservations.status, "ACTIVE"),
          eq(
            oddsObservations.isSynthetic,
            this.options.dataOrigin === "SYNTHETIC_DEMO",
          ),
          lte(oddsObservations.providerObservedAt, asOf),
          lte(oddsObservations.receivedAt, asOf),
        ),
      )
      .as("ranked_odds");
    const rows = await this.database
      .select({ observation: oddsObservations })
      .from(oddsObservations)
      .innerJoin(ranked, eq(oddsObservations.id, ranked.id))
      .where(
        or(
          lte(ranked.position, MAX_ODDS_HISTORY),
          eq(oddsObservations.providerObservedAt, ranked.opening),
        ),
      )
      .orderBy(
        asc(oddsObservations.providerObservedAt),
        asc(oddsObservations.id),
      );
    // PostgreSQL chooses opening/tail at full timestamp precision. Preserve
    // the legacy public ordering after decoding to millisecond-precision Date:
    // sub-millisecond observations then tie-break by immutable UUID.
    return rows
      .map((row) => row.observation)
      .sort((left, right) => {
        const instant =
          left.providerObservedAt.getTime() -
          right.providerObservedAt.getTime();
        return (
          instant || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
        );
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

    const matches = await this.getMatches(
      rows.map(({ event }) => event.id),
      asOf,
    );
    return { asOf, windowStart: start, windowEnd: end, matches };
  }

  async getMatch(
    eventId: string,
    asOf: Date,
  ): Promise<CustomerRawMatch | null> {
    return (await this.getMatches([eventId], asOf))[0] ?? null;
  }

  /** Distinct visible matches in requested order; each batch is at most 100 events. */
  async getMatches(
    eventIds: readonly string[],
    asOf: Date,
  ): Promise<CustomerRawMatch[]> {
    const ids = [...new Set(eventIds)];
    const matches: CustomerRawMatch[] = [];
    for (let offset = 0; offset < ids.length; offset += MAX_TODAY_EVENTS) {
      matches.push(
        ...(await this.getMatchBatch(
          ids.slice(offset, offset + MAX_TODAY_EVENTS),
          asOf,
        )),
      );
    }
    return matches;
  }

  private async getMatchBatch(
    eventIds: string[],
    asOf: Date,
  ): Promise<CustomerRawMatch[]> {
    const eventRows = await this.database
      .select({ event: events, sport: sports, competition: competitions })
      .from(events)
      .innerJoin(sports, eq(events.sportId, sports.id))
      .innerJoin(competitions, eq(events.competitionId, competitions.id))
      .where(and(this.corpus, inArray(events.id, eventIds)));
    if (eventRows.length === 0) return [];
    const visibleIds = eventRows.map((row) => row.event.id);
    // The legacy cap is 100 joined outcome rows per event, not 100 markets globally.
    const rankedMarkets = this.database
      .select({
        id: eventMarketOutcomes.id,
        position:
          sql<number>`row_number() over (partition by ${eventMarkets.eventId} order by ${marketDefinitions.familyCode}, ${marketDefinitions.code}, ${eventMarkets.lineValue}, ${eventMarkets.id}, ${outcomeDefinitions.sortOrder})`.as(
            "position",
          ),
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
      .where(inArray(eventMarkets.eventId, visibleIds))
      .as("ranked_markets");

    const [participantRows, lineups, marketRows] = await Promise.all([
      this.database
        .select({
          participant: participants,
          eventParticipant: eventParticipants,
        })
        .from(eventParticipants)
        .innerJoin(
          participants,
          eq(eventParticipants.participantId, participants.id),
        )
        .where(inArray(eventParticipants.eventId, visibleIds))
        .orderBy(asc(eventParticipants.role), asc(participants.id)),
      this.database
        .select()
        .from(lineupObservations)
        .where(
          and(
            inArray(lineupObservations.eventId, visibleIds),
            lte(lineupObservations.providerObservedAt, asOf),
            lte(lineupObservations.receivedAt, asOf),
          ),
        )
        .orderBy(
          desc(lineupObservations.providerObservedAt),
          asc(lineupObservations.id),
        ),
      this.database
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
        .innerJoin(rankedMarkets, eq(eventMarketOutcomes.id, rankedMarkets.id))
        .where(lte(rankedMarkets.position, MAX_MATCH_MARKETS))
        .orderBy(
          asc(marketDefinitions.familyCode),
          asc(marketDefinitions.code),
          asc(eventMarkets.lineValue),
          asc(eventMarkets.id),
          asc(outcomeDefinitions.sortOrder),
        ),
    ]);
    const outcomeIds = marketRows.map((row) => row.outcome.id);
    const rankedPredictions = this.database
      .select({
        id: predictions.id,
        position:
          sql<number>`row_number() over (partition by ${predictions.eventMarketOutcomeId} order by ${predictions.createdAt} desc, ${predictions.id} desc)`.as(
            "position",
          ),
      })
      .from(predictions)
      .innerJoin(
        predictionRuns,
        eq(predictions.predictionRunId, predictionRuns.id),
      )
      .where(
        and(
          inArray(predictions.eventMarketOutcomeId, outcomeIds),
          lte(predictions.createdAt, asOf),
          lte(predictionRuns.featureCutoff, asOf),
        ),
      )
      .as("ranked_predictions");
    const rankedQuality = this.database
      .select({
        id: dataQualityAssessments.id,
        position:
          sql<number>`row_number() over (partition by ${dataQualityAssessments.eventId}, ${dataQualityAssessments.marketOutcomeId} order by ${dataQualityAssessments.asOf} desc, ${dataQualityAssessments.id} desc)`.as(
            "position",
          ),
      })
      .from(dataQualityAssessments)
      .where(
        and(
          inArray(dataQualityAssessments.eventId, visibleIds),
          inArray(dataQualityAssessments.marketOutcomeId, outcomeIds),
          lte(dataQualityAssessments.asOf, asOf),
        ),
      )
      .as("ranked_quality");
    const rankedScores = this.database
      .select({
        id: scoreResults.id,
        position:
          sql<number>`row_number() over (partition by ${scoreResults.eventMarketOutcomeId} order by ${scoreResults.asOf} desc, ${scoreResults.createdAt} desc, ${scoreResults.id} desc)`.as(
            "position",
          ),
      })
      .from(scoreResults)
      .where(
        and(
          inArray(scoreResults.eventMarketOutcomeId, outcomeIds),
          lte(scoreResults.asOf, asOf),
        ),
      )
      .as("ranked_scores");
    const [predictionRows, qualityRows, scoreRows, odds] = await Promise.all([
      this.database
        .select({ prediction: predictions, run: predictionRuns })
        .from(predictions)
        .innerJoin(
          predictionRuns,
          eq(predictions.predictionRunId, predictionRuns.id),
        )
        .innerJoin(rankedPredictions, eq(predictions.id, rankedPredictions.id))
        .where(eq(rankedPredictions.position, 1)),
      this.database
        .select({ quality: dataQualityAssessments })
        .from(dataQualityAssessments)
        .innerJoin(
          rankedQuality,
          eq(dataQualityAssessments.id, rankedQuality.id),
        )
        .where(eq(rankedQuality.position, 1)),
      this.database
        .select({ result: scoreResults })
        .from(scoreResults)
        .innerJoin(rankedScores, eq(scoreResults.id, rankedScores.id))
        .where(eq(rankedScores.position, 1)),
      this.getBulkOddsHistory(outcomeIds, asOf),
    ]);
    const [inputs, evidence] = await Promise.all([
      predictionRows.length
        ? this.database
            .select()
            .from(predictionInputs)
            .where(
              inArray(
                predictionInputs.predictionId,
                predictionRows.map((row) => row.prediction.id),
              ),
            )
            .orderBy(
              asc(predictionInputs.createdAt),
              asc(predictionInputs.sourceObservationId),
            )
        : [],
      scoreRows.length
        ? this.database
            .select()
            .from(radarEvidence)
            .where(
              inArray(
                radarEvidence.scoreResultId,
                scoreRows.map((row) => row.result.id),
              ),
            )
        : [],
    ]);

    const participantsByEvent = groupBy(
      participantRows,
      (row) => row.eventParticipant.eventId,
    );
    const lineupsByEvent = groupBy(lineups, (row) => row.eventId);
    const inputsByPrediction = groupBy(inputs, (row) => row.predictionId);
    const oddsByOutcome = groupBy(odds, (row) => row.eventMarketOutcomeId);
    const predictionByOutcome = new Map(
      predictionRows.map((row) => [row.prediction.eventMarketOutcomeId, row]),
    );
    const qualityByIdentity = new Map(
      qualityRows.map(({ quality }) => [
        `${quality.eventId}:${quality.marketOutcomeId}`,
        quality,
      ]),
    );
    const scoreByOutcome = new Map(
      scoreRows.map(({ result }) => [result.eventMarketOutcomeId, result]),
    );
    const evidenceByScore = new Map(
      evidence.map((row) => [row.scoreResultId, row]),
    );
    const outcomes = marketRows.map((row): CustomerRawOutcome => {
      const prediction = predictionByOutcome.get(row.outcome.id) ?? null;
      const result = scoreByOutcome.get(row.outcome.id);
      return {
        ...row,
        prediction,
        predictionInputs: prediction
          ? (inputsByPrediction.get(prediction.prediction.id) ?? [])
          : [],
        quality:
          qualityByIdentity.get(`${row.market.eventId}:${row.outcome.id}`) ??
          null,
        score: result
          ? { result, radarEvidence: evidenceByScore.get(result.id) ?? null }
          : null,
        odds: oddsByOutcome.get(row.outcome.id) ?? [],
      };
    });
    const outcomesByEvent = groupBy(outcomes, (row) => row.market.eventId);
    const eventsById = new Map(eventRows.map((row) => [row.event.id, row]));
    return eventIds.flatMap((id): CustomerRawMatch[] => {
      const row = eventsById.get(id);
      return row
        ? [
            {
              ...row,
              participants: participantsByEvent.get(id) ?? [],
              lineups: lineupsByEvent.get(id) ?? [],
              outcomes: outcomesByEvent.get(id) ?? [],
              asOf,
            },
          ]
        : [];
    });
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
    const rows = await this.getBulkOddsHistory([eventMarketOutcomeId], asOf);
    return {
      eventId: ownership.eventId,
      eventMarketOutcomeId: ownership.outcomeId,
      asOf,
      observations: rows,
    };
  }
}

/** Preserve SQL order inside each identity partition. */
function groupBy<T>(
  rows: readonly T[],
  key: (row: T) => string,
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const identity = key(row);
    const group = groups.get(identity);
    if (group) group.push(row);
    else groups.set(identity, [row]);
  }
  return groups;
}
