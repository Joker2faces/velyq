import { desc, eq, inArray, sql } from "drizzle-orm";
import {
  brierScore,
  empiricalFrequencies,
  expectedCalibrationError,
  logLoss,
  reliabilityBins,
  type ProbabilisticSample,
} from "@velyq/research";
import { utcDayWindow } from "@velyq/database";
import { createForecastCycleDbAdapter } from "@velyq/database/repositories/forecast-cycle-adapter";
import { queryMultiClassCalibrationRows } from "@velyq/database/repositories/multiclass-calibration";
import { loadProductionModelArtifact } from "./forecast-cycle/model-artifact";
import { DatabasePermissionResolver } from "@velyq/database/repositories/permissions";
import type { PrivilegedVelyqDatabase } from "@velyq/database/server";
import { createPrivilegedDatabaseClient } from "@velyq/database/server";
import { adminAuditEvents } from "@velyq/database/schema/audit";
import {
  dataQualityAssessments,
  predictionInputs,
  predictionRuns,
  predictions,
  scoreDefinitionVersions,
  scoreResults,
} from "@velyq/database/schema/intelligence";
import {
  eventMarketOutcomes,
  oddsObservations,
  outcomeDefinitions,
} from "@velyq/database/schema/market";
import {
  providerIngestionRuns,
  providers,
  providerQuotaState as quotaStateTable,
  providerSyncRuns,
} from "@velyq/database/schema/operations";
import {
  buildMarketSnapshot,
  type RawBookmakerObservation,
} from "@velyq/market-semantics";
import { canonicalizeNumeric } from "@velyq/decimal";
import type { ProviderRun } from "@velyq/contracts";
import type {
  AdminPage,
  AdminProviderIngestionRunDto,
  AdminPredictionTraceDto,
  AdminQualityDto,
  AdminQueries,
  AdminIntelligenceOverviewDto,
  AdminQuotaSnapshotDto,
  AdminScoreDto,
} from "./admin-api";
import { createSupabaseAdminAuthenticator } from "./admin-auth";

const json = (value: unknown) => value as never;

function cursorOffset(cursor: string | null) {
  if (cursor === null) return 0;
  const value = Number.parseInt(cursor, 10);
  if (!/^\d+$/.test(cursor) || !Number.isInteger(value) || value < 0)
    throw new Error("INVALID_REQUEST");
  return value;
}

function nextCursor(offset: number, limit: number, count: number) {
  return count === limit ? String(offset + limit) : null;
}

function providerRun(
  row: typeof providerSyncRuns.$inferSelect,
  providerCode = row.providerId,
): ProviderRun {
  return {
    id: row.id,
    providerCode,
    sequenceName: row.replaySequence ?? "unknown",
    status: row.status as ProviderRun["status"],
    sourceFixtureHash: row.contentHash ?? "unknown",
    normalizedOutputHash: row.normalizedOutputHash,
    receivedCount: row.receivedCount,
    acceptedCount: row.acceptedCount,
    rejectedCount: row.rejectedCount,
    startedAt: row.startedAt?.toISOString() ?? "",
    completedAt: row.completedAt?.toISOString() ?? null,
    errorSummary: row.errorSummary as ProviderRun["errorSummary"],
  };
}

function reasonCounts(value: unknown): Readonly<Record<string, number>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([reason, count]) =>
      typeof count === "number" && Number.isFinite(count)
        ? [[reason, count]]
        : [],
    ),
  );
}

function providerIngestionRun(
  row: typeof providerIngestionRuns.$inferSelect,
  providerCode = row.providerId,
): AdminProviderIngestionRunDto {
  const errorsByReason = reasonCounts(row.errorsByReason);
  const hasErrors = Object.values(errorsByReason).some((count) => count > 0);
  const hasResultErrors = Object.entries(errorsByReason).some(
    ([reason, count]) => reason.startsWith("RESULT_") && count > 0,
  );
  const runHealth =
    row.status === "FAILED"
      ? "FAILED"
      : row.status === "RUNNING"
        ? "RUNNING"
        : hasErrors
          ? "COMPLETED_WITH_ERRORS"
          : row.providerCallsUsed === 0
            ? "HEALTHY_IDLE"
            : "HEALTHY_ACTIVE";
  const resultOutcome =
    row.resultRequestsAttempted === 0
      ? "NOT_ATTEMPTED"
      : row.status === "FAILED" || hasResultErrors
        ? "FAILED"
        : "SUCCEEDED";

  return {
    id: row.id,
    providerCode,
    trigger: row.trigger as AdminProviderIngestionRunDto["trigger"],
    quotaDay: row.quotaDay,
    quotaPolicyVersion: row.quotaPolicyVersion,
    status: row.status as AdminProviderIngestionRunDto["status"],
    runHealth,
    resultOutcome,
    providerCallsUsed: row.providerCallsUsed,
    quotaStateAtStart: row.quotaStateAtStart,
    quotaStateAtEnd: row.quotaStateAtEnd,
    quotaRemainingAtEnd: row.quotaRemainingAtEnd,
    discoveryDatesRequested: row.discoveryDatesRequested,
    fixtures: {
      received: row.fixturesReceived,
      written: row.fixturesWritten,
    },
    odds: {
      candidates: row.oddsCandidates,
      requestsAttempted: row.oddsRequestsAttempted,
      received: row.oddsObservationsReceived,
      written: row.oddsObservationsWritten,
      duplicates: row.oddsDuplicates,
    },
    lineups: {
      candidates: row.lineupCandidates,
      requestsAttempted: row.lineupRequestsAttempted,
      received: row.lineupsReceived,
      written: row.lineupsWritten,
      duplicates: row.lineupDuplicates,
      official: row.lineupsOfficial,
    },
    results: {
      candidates: row.resultCandidates,
      requestsAttempted: row.resultRequestsAttempted,
      received: row.resultsReceived,
      written: row.resultsWritten,
      duplicates: row.resultDuplicates,
      settlementsWritten: row.settlementsWritten,
    },
    skippedByReason: reasonCounts(row.skippedByReason),
    errorsByReason,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}

export class DatabaseAdminQueries implements AdminQueries {
  constructor(private readonly database: PrivilegedVelyqDatabase) {}

  async listProviderRuns(input: { limit: number; cursor: string | null }) {
    const offset = cursorOffset(input.cursor);
    const rows = await this.database
      .select({ run: providerSyncRuns, providerCode: providers.code })
      .from(providerSyncRuns)
      .innerJoin(providers, eq(providerSyncRuns.providerId, providers.id))
      .orderBy(desc(providerSyncRuns.startedAt), desc(providerSyncRuns.id))
      .limit(input.limit)
      .offset(offset);
    return {
      items: rows.map(({ run, providerCode }) =>
        providerRun(run, providerCode),
      ),
      nextCursor: nextCursor(offset, input.limit, rows.length),
    } satisfies AdminPage<ProviderRun>;
  }

  async listProviderIngestionRuns(input: {
    limit: number;
    cursor: string | null;
  }) {
    const offset = cursorOffset(input.cursor);
    const rows = await this.database
      .select({ run: providerIngestionRuns, providerCode: providers.code })
      .from(providerIngestionRuns)
      .innerJoin(providers, eq(providerIngestionRuns.providerId, providers.id))
      .orderBy(
        desc(providerIngestionRuns.startedAt),
        desc(providerIngestionRuns.id),
      )
      .limit(input.limit)
      .offset(offset);
    return {
      items: rows.map(({ run, providerCode }) =>
        providerIngestionRun(run, providerCode),
      ),
      nextCursor: nextCursor(offset, input.limit, rows.length),
    } satisfies AdminPage<AdminProviderIngestionRunDto>;
  }

  async getIntelligenceOverview(): Promise<AdminIntelligenceOverviewDto> {
    const result = await this.database.execute(sql`
      with today_events as (select id, competition_id from catalog.events where starts_at >= date_trunc('day', now() at time zone 'utc') and starts_at < date_trunc('day', now() at time zone 'utc') + interval '1 day'),
      forecast_rows as (select f.*, em.event_id from intelligence.forecasts f join market.event_market_outcomes emo on emo.id=f.event_market_outcome_id join market.event_markets em on em.id=emo.event_market_id),
      decision_rows as (select d.*, em.event_id from intelligence.decisions d join market.event_market_outcomes emo on emo.id=d.event_market_outcome_id join market.event_markets em on em.id=emo.event_market_id)
      select
        (select count(*) from today_events)::int fixtures_discovered,
        (select count(distinct te.id) from today_events te join catalog.competition_identities ci on ci.competition_id=te.competition_id and ci.mapping_status='CONFIRMED')::int competition_mapped,
        (select count(distinct te.id) from today_events te where (select count(*) from catalog.event_participants ep where ep.event_id=te.id)=2)::int teams_resolved,
        (select count(distinct event_id) from forecast_rows where event_id in (select id from today_events))::int model_supported,
        (select count(distinct event_id) from forecast_rows where event_id in (select id from today_events))::int forecast_generated,
        (select count(distinct em.event_id) from market.odds_observations oo join market.event_market_outcomes emo on emo.id=oo.event_market_outcome_id join market.event_markets em on em.id=emo.event_market_id where em.event_id in (select id from today_events) and oo.status='ACTIVE')::int odds_available,
        (select count(distinct event_id) from decision_rows where event_id in (select id from today_events))::int decision_evaluated,
        (select count(*) from decision_rows where event_id in (select id from today_events) and status='STRONG_EDGE')::int edge,
        (select count(*) from decision_rows where event_id in (select id from today_events) and status in ('WAIT','EDGE_DISAPPEARED'))::int watch,
        (select count(*) from decision_rows where event_id in (select id from today_events) and status='NO_BET')::int no_bet,
        (select count(*) from decision_rows where event_id in (select id from today_events) and status='WAIT_FOR_LINEUP')::int wait_for_lineup,
        (select count(*) from decision_rows where event_id in (select id from today_events) and status='INSUFFICIENT_DATA')::int insufficient_data,
        (select count(*) from catalog.events e where e.starts_at < now() and e.status not in ('FINAL','CANCELLED','ABANDONED') and not exists(select 1 from intelligence.event_results er where er.event_id=e.id and er.status='FINAL'))::int events_awaiting_result,
        (select count(*) from intelligence.event_results where status='FINAL')::int final_results_received,
        (select count(*) from intelligence.decisions d where d.status='STRONG_EDGE' and not exists(select 1 from intelligence.market_settlements ms where ms.decision_id=d.id))::int settlements_pending,
        (select count(*) from intelligence.market_settlements where outcome<>'UNSETTLED')::int settlements_completed,
        (select count(*) from operations.provider_ingestion_runs pir where pir.result_requests_attempted > 0 and (pir.status='FAILED' or exists(select 1 from jsonb_each_text(pir.errors_by_reason) error where left(error.key, 7)='RESULT_' and error.value::int > 0)))::int result_ingestion_failures,
        (select count(*) from intelligence.decisions d left join intelligence.market_settlements ms on ms.decision_id=d.id where d.status='STRONG_EDGE' and (ms.id is null or ms.outcome='UNSETTLED'))::int unsettled_actionable_decisions,
        (select max(pir.finished_at) from operations.provider_ingestion_runs pir where pir.status='COMPLETED' and pir.result_requests_attempted > 0 and not exists(select 1 from jsonb_each_text(pir.errors_by_reason) error where left(error.key, 7)='RESULT_' and error.value::int > 0)) last_successful_result_sync,
        (select max(settled_at) from intelligence.market_settlements) last_settlement_run
    `);
    const row = result.rows[0] as Record<string, unknown>;
    const blockerResult = await this.database.execute(
      sql`select code, count(*)::int count from intelligence.decisions d cross join lateral unnest(d.why_not_codes) code where d.created_at >= date_trunc('day', now() at time zone 'utc') group by code order by count desc, code`,
    );
    const blockers = Object.fromEntries(
      blockerResult.rows.map((item) => [
        String(item["code"]),
        Number(item["count"]),
      ]),
    );
    /*
     * "Where are identity problems?" -- a competition identity stuck at
     * PENDING_REVIEW or REJECTED is exactly why a fixture can be discovered
     * but never priced: the forecast cycle fails closed on anything but
     * CONFIRMED, by design (see the mapping_status comment on
     * competition_identities), so an unresolved identity is a real,
     * actionable blocker, not noise.
     */
    const identityResult = await this.database.execute(
      sql`select display_name, mapping_status, provider_competition_id from catalog.competition_identities where mapping_status <> 'CONFIRMED' order by created_at desc limit 20`,
    );
    const identityIssues = identityResult.rows.map((item) => ({
      displayName: String(item["display_name"]),
      mappingStatus: String(item["mapping_status"]),
      providerCompetitionId: String(item["provider_competition_id"]),
    }));
    /*
     * Competition joined in so sample sizes and calibration can be split by
     * competition, not just pooled across every league a model has ever
     * priced -- a model that is well calibrated overall can still be
     * systematically wrong on one competition with too little history of
     * its own, and pooling hides exactly that.
     */
    const healthResult = await this.database.execute(
      sql`select f.model_version, f.probability, ms.outcome, c.code as competition_code from intelligence.forecasts f join intelligence.decisions d on d.forecast_id=f.id join intelligence.market_settlements ms on ms.decision_id=d.id join market.event_market_outcomes emo on emo.id=d.event_market_outcome_id join market.event_markets em on em.id=emo.event_market_id join catalog.events e on e.id=em.event_id join catalog.competitions c on c.id=e.competition_id where ms.outcome in ('WIN','LOSS') order by f.model_version`,
    );
    const grouped = new Map<
      string,
      { probability: number; actual: number }[]
    >();
    const groupedByCompetition = new Map<
      string,
      Map<string, { probability: number; actual: number }[]>
    >();
    for (const item of healthResult.rows) {
      const version = String(item["model_version"]);
      const competitionCode = String(item["competition_code"]);
      const sample = {
        probability: Number(item["probability"]),
        actual: item["outcome"] === "WIN" ? 1 : 0,
      };
      grouped.set(version, [...(grouped.get(version) ?? []), sample]);
      const byCompetition = groupedByCompetition.get(version) ?? new Map();
      byCompetition.set(competitionCode, [
        ...(byCompetition.get(competitionCode) ?? []),
        sample,
      ]);
      groupedByCompetition.set(version, byCompetition);
    }
    /*
     * A binary framing of the decision's own selected outcome (did it
     * happen or not), not a true three-way 1X2 calibration -- the forecasts
     * table stores one probability per outcome the decision engine acted
     * on, not the full HOME/DRAW/AWAY vector for the same market instance,
     * so a genuine multi-class calibration would need a new join across
     * sibling forecasts. This is scored with the shared, tested scoring
     * functions (`@velyq/research`) rather than a hand-rolled formula, and
     * adds what the ad-hoc version never had: calibration bins and the
     * empirical-frequency baseline any model has to beat.
     */
    const metricsFor = (values: { probability: number; actual: number }[]) => {
      const enough = values.length >= 30;
      const samples: ProbabilisticSample[] = values.map((value) => ({
        probabilities: [value.probability, 1 - value.probability],
        observedIndex: value.actual === 1 ? 0 : 1,
      }));
      const baseline = enough ? empiricalFrequencies(samples, 2) : null;
      return {
        sampleCount: values.length,
        brierScore: enough ? brierScore(samples) : null,
        logLoss: enough ? logLoss(samples) : null,
        calibrationError: enough ? expectedCalibrationError(samples, 2) : null,
        calibrationBins: enough ? reliabilityBins(samples, 0) : [],
        /** How often the selected outcome actually happened, historically --
            the baseline a model with real skill must beat. */
        baselineHitRate: baseline ? (baseline[0] ?? null) : null,
        status: enough
          ? ("AVAILABLE" as const)
          : ("INSUFFICIENT_SAMPLE" as const),
      };
    };
    const modelHealth = [...grouped].map(([modelVersion, values]) => {
      const byCompetitionMap =
        groupedByCompetition.get(modelVersion) ?? new Map();
      return {
        modelVersion,
        ...metricsFor(values),
        /*
         * Split by competition so a model that reads as well-calibrated
         * pooled cannot hide being systematically wrong on one league it
         * has too little history of on its own.
         */
        byCompetition: [...byCompetitionMap]
          .map(([competitionCode, competitionValues]) => ({
            competitionCode,
            ...metricsFor(competitionValues),
          }))
          .sort((a, b) => b.sampleCount - a.sampleCount),
      };
    });
    /*
     * TRUE three-way 1X2 calibration, not the binary "did the selected
     * outcome happen" framing above. `forecast-cycle.ts` already writes one
     * forecast row per outcome (HOME/DRAW/AWAY) for every event it prices --
     * the data was always there, just never joined this way. This pulls all
     * three sibling forecasts for the same event_market and derives the true
     * outcome directly from `event_results` scores, independent of which
     * outcome (if any) VELYQ actually decided on -- so this includes events
     * where the decision engine never acted at all, unlike the binary
     * section above which only ever sees settled, acted-on decisions.
     */
    const multiClassRows = await queryMultiClassCalibrationRows(this.database);
    const outcomeIndex = (code: string) =>
      code === "HOME" ? 0 : code === "DRAW" ? 1 : 2;
    const multiClassGrouped = new Map<string, ProbabilisticSample[]>();
    const multiClassByCompetition = new Map<
      string,
      Map<string, ProbabilisticSample[]>
    >();
    /*
     * Season splits catch a different failure mode than competition splits:
     * a model can be well-calibrated pooled across seasons while having
     * quietly drifted (or been retrained/re-tuned) mid-season -- pooling
     * across time hides exactly that, the same reason competition pooling
     * hides a single under-sampled league being wrong.
     */
    const multiClassBySeason = new Map<
      string,
      Map<string, ProbabilisticSample[]>
    >();
    for (const item of multiClassRows) {
      const version = item.modelVersion;
      const competitionCode = item.competitionCode;
      const seasonLabel = item.seasonLabel ?? "UNKNOWN";
      const sample: ProbabilisticSample = {
        probabilities: [
          Number(item.probabilityHome),
          Number(item.probabilityDraw),
          Number(item.probabilityAway),
        ],
        observedIndex: outcomeIndex(item.trueOutcome),
      };
      multiClassGrouped.set(version, [
        ...(multiClassGrouped.get(version) ?? []),
        sample,
      ]);
      const byCompetition = multiClassByCompetition.get(version) ?? new Map();
      byCompetition.set(competitionCode, [
        ...(byCompetition.get(competitionCode) ?? []),
        sample,
      ]);
      multiClassByCompetition.set(version, byCompetition);
      const bySeason = multiClassBySeason.get(version) ?? new Map();
      bySeason.set(seasonLabel, [...(bySeason.get(seasonLabel) ?? []), sample]);
      multiClassBySeason.set(version, bySeason);
    }
    /*
     * Never promoted to non-EXPERIMENTAL on sample size alone -- that
     * remains a modelling and product decision, not something this audit
     * can certify. 30 is the same minimum-sample floor already used for the
     * binary framing above, applied per class-vector sample (one per
     * settled event) rather than per decision.
     */
    const multiClassMetricsFor = (samples: ProbabilisticSample[]) => {
      const enough = samples.length >= 30;
      const baseline = enough ? empiricalFrequencies(samples, 3) : null;
      return {
        sampleCount: samples.length,
        status: enough
          ? ("AVAILABLE" as const)
          : ("INSUFFICIENT_SAMPLE" as const),
        brierScore: enough ? brierScore(samples) : null,
        logLoss: enough ? logLoss(samples) : null,
        calibrationError: enough ? expectedCalibrationError(samples, 3) : null,
        baselineFrequencies: baseline
          ? {
              home: baseline[0] ?? 0,
              draw: baseline[1] ?? 0,
              away: baseline[2] ?? 0,
            }
          : null,
      };
    };
    /*
     * VELYQ's own probabilities are not the whole answer to "is this model
     * any good" -- the mandate's explicit comparison is model vs. what the
     * market itself already believed for the exact same settled events.
     * Reuses the real, tested `buildMarketSnapshot` (the same function
     * behind the customer-facing Market Map) at each event's own kickoff,
     * never a re-derivation of the de-vig math -- so a bug fixed there is
     * fixed here too, not duplicated and left to drift.
     */
    const eventMarketIds = [
      ...new Set(multiClassRows.map((item) => item.eventMarketId)),
    ];
    const oddsRows =
      eventMarketIds.length > 0
        ? await this.database
            .select({
              eventMarketId: eventMarketOutcomes.eventMarketId,
              outcomeCode: outcomeDefinitions.code,
              bookmakerId: oddsObservations.bookmakerId,
              decimalOdds: oddsObservations.decimalOdds,
              providerObservedAt: oddsObservations.providerObservedAt,
            })
            .from(oddsObservations)
            .innerJoin(
              eventMarketOutcomes,
              eq(oddsObservations.eventMarketOutcomeId, eventMarketOutcomes.id),
            )
            .innerJoin(
              outcomeDefinitions,
              eq(
                eventMarketOutcomes.outcomeDefinitionId,
                outcomeDefinitions.id,
              ),
            )
            .where(inArray(eventMarketOutcomes.eventMarketId, eventMarketIds))
        : [];
    const oddsByEventMarket = new Map<string, RawBookmakerObservation[]>();
    for (const oddsRow of oddsRows) {
      oddsByEventMarket.set(oddsRow.eventMarketId, [
        ...(oddsByEventMarket.get(oddsRow.eventMarketId) ?? []),
        {
          bookmakerId: oddsRow.bookmakerId,
          outcomeCode: oddsRow.outcomeCode,
          decimalOdds: canonicalizeNumeric(oddsRow.decimalOdds) as never,
          providerObservedAt: oddsRow.providerObservedAt.toISOString(),
        },
      ]);
    }
    /*
     * A naive vig-included baseline, proportionally normalized from each
     * outcome's best price -- distinct from the real de-vig consensus
     * below, and deliberately using plain numbers: this is a statistical
     * scoring aggregate over many samples (like Brier/log loss themselves),
     * not authoritative money math, so float precision here is immaterial.
     */
    const normalizedImpliedProbabilities = (
      odds: readonly (string | null)[],
    ): readonly number[] | null => {
      if (odds.some((value) => value === null)) return null;
      const reciprocals = odds.map((value) => 1 / Number(value));
      const sum = reciprocals.reduce((total, value) => total + value, 0);
      if (!Number.isFinite(sum) || sum <= 0) return null;
      return reciprocals.map((value) => value / sum);
    };
    const marketNoVigGrouped = new Map<string, ProbabilisticSample[]>();
    const marketImpliedGrouped = new Map<string, ProbabilisticSample[]>();
    for (const item of multiClassRows) {
      const version = item.modelVersion;
      const eventMarketId = item.eventMarketId;
      const kickoff = item.kickoff;
      const observedIndex = outcomeIndex(item.trueOutcome);
      const snapshot = buildMarketSnapshot(
        oddsByEventMarket.get(eventMarketId) ?? [],
        ["HOME", "DRAW", "AWAY"],
        { asOf: kickoff },
      );
      if (!snapshot) continue;
      if (snapshot.consensus) {
        marketNoVigGrouped.set(version, [
          ...(marketNoVigGrouped.get(version) ?? []),
          {
            probabilities: snapshot.consensus.probabilities.map(Number),
            observedIndex,
          },
        ]);
      }
      const bestOdds = ["HOME", "DRAW", "AWAY"].map(
        (code) =>
          snapshot.outcomes.find((outcome) => outcome.outcomeCode === code)
            ?.bestOdds ?? null,
      );
      const implied = normalizedImpliedProbabilities(bestOdds);
      if (implied) {
        marketImpliedGrouped.set(version, [
          ...(marketImpliedGrouped.get(version) ?? []),
          { probabilities: implied, observedIndex },
        ]);
      }
    }
    const marketBaselineFor = (samples: ProbabilisticSample[]) => {
      const enough = samples.length >= 30;
      return {
        sampleCount: samples.length,
        status: enough
          ? ("AVAILABLE" as const)
          : ("INSUFFICIENT_SAMPLE" as const),
        brierScore: enough ? brierScore(samples) : null,
        logLoss: enough ? logLoss(samples) : null,
      };
    };

    const multiClassCalibration = [...multiClassGrouped].map(
      ([modelVersion, samples]) => {
        const byCompetitionMap =
          multiClassByCompetition.get(modelVersion) ?? new Map();
        const bySeasonMap = multiClassBySeason.get(modelVersion) ?? new Map();
        return {
          modelVersion,
          ...multiClassMetricsFor(samples),
          byCompetition: [...byCompetitionMap]
            .map(([competitionCode, competitionSamples]) => ({
              competitionCode,
              ...multiClassMetricsFor(competitionSamples),
            }))
            .sort((a, b) => b.sampleCount - a.sampleCount),
          bySeason: [...bySeasonMap]
            .map(([seasonLabel, seasonSamples]) => ({
              seasonLabel,
              ...multiClassMetricsFor(seasonSamples),
            }))
            .sort((a, b) => b.sampleCount - a.sampleCount),
          noVigConsensus: marketBaselineFor(
            marketNoVigGrouped.get(modelVersion) ?? [],
          ),
          impliedMarket: marketBaselineFor(
            marketImpliedGrouped.get(modelVersion) ?? [],
          ),
        };
      },
    );
    const count = (key: string) => Number(row[key] ?? 0);
    const timestamp = (key: string) =>
      row[key] ? new Date(String(row[key])).toISOString() : null;
    return {
      fixturesDiscovered: count("fixtures_discovered"),
      competitionMapped: count("competition_mapped"),
      teamsResolved: count("teams_resolved"),
      modelSupported: count("model_supported"),
      forecastGenerated: count("forecast_generated"),
      oddsAvailable: count("odds_available"),
      decisionEvaluated: count("decision_evaluated"),
      edge: count("edge"),
      watch: count("watch"),
      noBet: count("no_bet"),
      waitForLineup: count("wait_for_lineup"),
      insufficientData: count("insufficient_data"),
      blockers,
      eventsAwaitingResult: count("events_awaiting_result"),
      finalResultsReceived: count("final_results_received"),
      settlementsPending: count("settlements_pending"),
      settlementsCompleted: count("settlements_completed"),
      resultIngestionFailures: count("result_ingestion_failures"),
      unsettledActionableDecisions: count("unsettled_actionable_decisions"),
      lastSuccessfulResultSync: timestamp("last_successful_result_sync"),
      lastSettlementRun: timestamp("last_settlement_run"),
      modelHealth,
      multiClassCalibration,
      identityIssues,
    };
  }

  /**
   * Model/data coverage audit: for each of today's real fixtures, a genuine
   * dry run of the SAME eligibility resolution `runForecastCycle` uses --
   * `resolveCompetition`/`resolveHomeTeam`/`resolveAwayTeam` from the real
   * forecast-cycle adapter, not a re-implementation that could quietly
   * drift from the actual pipeline. No prediction, forecast or decision is
   * written; this only asks the three questions and tabulates the answers.
   *
   * Distinguishes a DATA COVERAGE PROBLEM (the competition or team is not
   * in the model at all -- COMPETITION_NOT_IN_MODEL / TEAM_NOT_IN_MODEL)
   * from every other reason a fixture might not produce an actionable
   * decision (the model ran and decided NO_BET/WAIT/etc, which is a real
   * business outcome, not a coverage gap). Those two questions were
   * previously conflated: fixtures skipped for eligibility never reach the
   * `decisions` table at all, so admin's blocker panel -- which reads
   * `decisions.why_not_codes` -- was structurally blind to them; the only
   * place they ever appeared was the forecast-cycle trigger's own HTTP
   * response body, gone the moment that request finished.
   */
  async getModelCoverageAudit() {
    const modelArtifact = loadProductionModelArtifact();
    const adapter = await createForecastCycleDbAdapter(this.database, {
      modelArtifact,
      providerCode: "API_SPORTS",
      dataOrigin: "LIVE",
    });
    const now = new Date();
    const window = utcDayWindow(now);
    const fixtures = await adapter.loadEligibleFixtures({
      from: window.start,
      to: window.end,
    });

    let competitionMissing = 0;
    let teamMissing = 0;
    let eligible = 0;
    const missingCompetitions = new Set<string>();
    const missingTeams = new Set<string>();

    for (const fixture of fixtures) {
      const competition = await adapter.resolveCompetition(fixture);
      if (!competition.ok) {
        competitionMissing += 1;
        missingCompetitions.add(fixture.providerCompetitionCode);
        continue;
      }
      const [home, away] = await Promise.all([
        adapter.resolveHomeTeam(fixture),
        adapter.resolveAwayTeam(fixture),
      ]);
      const homeResolved =
        home.status === "PROVIDER_IDENTITY_MATCH" ||
        home.status === "VERIFIED_ALIAS_MATCH";
      const awayResolved =
        away.status === "PROVIDER_IDENTITY_MATCH" ||
        away.status === "VERIFIED_ALIAS_MATCH";
      if (!homeResolved) {
        teamMissing += 1;
        missingTeams.add(fixture.homeTeam.normalizedName);
        continue;
      }
      if (!awayResolved) {
        teamMissing += 1;
        missingTeams.add(fixture.awayTeam.normalizedName);
        continue;
      }
      eligible += 1;
    }

    return {
      fixturesChecked: fixtures.length,
      competitionMissing,
      teamMissing,
      eligible,
      missingCompetitions: [...missingCompetitions].slice(0, 20),
      missingTeams: [...missingTeams].slice(0, 20),
    };
  }

  async getQuotaSnapshot() {
    /*
     * One row per provider per day already carries the state the scheduler
     * itself computed at its last write -- no re-derivation needed, and no
     * new table. This is exactly the "why is Today empty" question an
     * operator asks first, and until now it was answerable only by reading
     * a Supabase Cron response body by hand.
     */
    const rows = await this.database
      .select({
        providerCode: providers.code,
        quotaDay: quotaStateTable.quotaDay,
        dailyLimit: quotaStateTable.dailyLimit,
        remaining: quotaStateTable.remaining,
        requestsUsed: quotaStateTable.requestsUsed,
        discoveryRequests: quotaStateTable.discoveryRequests,
        oddsRequests: quotaStateTable.oddsRequests,
        lineupRequests: quotaStateTable.lineupRequests,
        resultRequests: quotaStateTable.resultRequests,
        lastProviderCallAt: quotaStateTable.lastProviderCallAt,
        policyState: quotaStateTable.policyState,
      })
      .from(quotaStateTable)
      .innerJoin(providers, eq(quotaStateTable.providerId, providers.id))
      .orderBy(desc(quotaStateTable.quotaDay))
      /* Today's row per provider, plus a little history for trend context. */
      .limit(5);
    return rows.map((row) => ({
      providerCode: row.providerCode,
      quotaDay: row.quotaDay,
      dailyLimit: row.dailyLimit,
      remaining: row.remaining,
      requestsUsed: row.requestsUsed,
      discoveryRequests: row.discoveryRequests,
      oddsRequests: row.oddsRequests,
      lineupRequests: row.lineupRequests,
      resultRequests: row.resultRequests,
      lastProviderCallAt: row.lastProviderCallAt?.toISOString() ?? null,
      policyState: row.policyState as
        "HEALTHY" | "CONSERVE" | "CRITICAL" | "EXHAUSTED" | "UNKNOWN",
    })) satisfies AdminQuotaSnapshotDto[];
  }

  async getProviderRun(runId: string) {
    const [row] = await this.database
      .select({ run: providerSyncRuns, providerCode: providers.code })
      .from(providerSyncRuns)
      .innerJoin(providers, eq(providerSyncRuns.providerId, providers.id))
      .where(eq(providerSyncRuns.id, runId))
      .limit(1);
    if (!row) throw new Error("NOT_FOUND");
    return providerRun(row.run, row.providerCode);
  }

  async getProviderIngestionRun(runId: string) {
    const [row] = await this.database
      .select({ run: providerIngestionRuns, providerCode: providers.code })
      .from(providerIngestionRuns)
      .innerJoin(providers, eq(providerIngestionRuns.providerId, providers.id))
      .where(eq(providerIngestionRuns.id, runId))
      .limit(1);
    if (!row) throw new Error("NOT_FOUND");
    return providerIngestionRun(row.run, row.providerCode);
  }

  async getPredictionTrace(
    predictionId: string,
  ): Promise<AdminPredictionTraceDto> {
    const [row] = await this.database
      .select({ prediction: predictions, run: predictionRuns })
      .from(predictions)
      .innerJoin(
        predictionRuns,
        eq(predictions.predictionRunId, predictionRuns.id),
      )
      .where(eq(predictions.id, predictionId))
      .limit(1);
    if (!row) throw new Error("NOT_FOUND");
    const inputs = await this.database
      .select({ sourceObservationId: predictionInputs.sourceObservationId })
      .from(predictionInputs)
      .where(eq(predictionInputs.predictionId, predictionId));
    return {
      predictionId: row.prediction.id,
      predictionRunId: row.run.id,
      eventId: row.run.eventId,
      eventMarketOutcomeId: row.prediction.eventMarketOutcomeId,
      modelVersionId: row.run.modelVersionId,
      calibrationVersionId: row.run.calibrationVersionId,
      featureCutoff: row.run.featureCutoff.toISOString(),
      status: row.run.status,
      decisionStatus: row.prediction.decisionStatus,
      modelProbability: row.prediction.modelProbability,
      confidence: row.prediction.confidence,
      fairOdds: row.prediction.fairOdds,
      marketImpliedProbability: row.prediction.marketImpliedProbability,
      edge: row.prediction.edge,
      expectedValue: row.prediction.expectedValue,
      reasonCodes: row.prediction.reasonCodes,
      structuredReasons: json(row.prediction.structuredReasons),
      sourceObservationIds: inputs.map((item) => item.sourceObservationId),
      dataQualityAssessmentId: row.prediction.dataQualityAssessmentId,
      marketPriceObservationId: row.prediction.marketPriceObservationId,
      createdAt: row.prediction.createdAt.toISOString(),
    };
  }

  async getScore(scoreId: string): Promise<AdminScoreDto> {
    const [row] = await this.database
      .select({ score: scoreResults, definition: scoreDefinitionVersions })
      .from(scoreResults)
      .innerJoin(
        scoreDefinitionVersions,
        eq(scoreResults.scoreDefinitionVersionId, scoreDefinitionVersions.id),
      )
      .where(eq(scoreResults.id, scoreId))
      .limit(1);
    if (!row) throw new Error("NOT_FOUND");
    return {
      id: row.score.id,
      scoreDefinitionVersionId: row.score.scoreDefinitionVersionId,
      scoreType: row.definition.scoreType as "EDGE" | "RADAR",
      validationStatus: "DEVELOPMENT_HEURISTIC",
      predictionId: row.score.predictionId,
      eventMarketOutcomeId: row.score.eventMarketOutcomeId,
      dataQualityAssessmentId: row.score.dataQualityAssessmentId,
      asOf: row.score.asOf.toISOString(),
      score: row.score.score,
      components: json(row.score.components),
      weights: json(row.score.weights),
      capsPenalties: json(row.score.capsPenalties),
      reasonCodes: row.score.reasonCodes,
      createdAt: row.score.createdAt.toISOString(),
    };
  }

  async getQuality(assessmentId: string): Promise<AdminQualityDto> {
    const row = await this.database.query.dataQualityAssessments.findFirst({
      where: eq(dataQualityAssessments.id, assessmentId),
    });
    if (!row) throw new Error("NOT_FOUND");
    return {
      id: row.id,
      policyVersionId: row.policyVersionId,
      eventId: row.eventId,
      marketOutcomeId: row.marketOutcomeId,
      asOf: row.asOf.toISOString(),
      grade: row.grade,
      numericScore: row.numericScore,
      components: json(row.components),
      reasonCodes: row.reasonCodes,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async listAudit(input: { limit: number; cursor: string | null }) {
    const offset = cursorOffset(input.cursor);
    const rows = await this.database
      .select()
      .from(adminAuditEvents)
      .orderBy(desc(adminAuditEvents.occurredAt), desc(adminAuditEvents.id))
      .limit(input.limit)
      .offset(offset);
    return {
      items: rows.map((row) => ({
        id: row.id,
        actorUserId: row.actorUserId,
        action: row.action,
        resourceType: row.resourceType,
        resourceId: row.resourceId,
        requestId: row.requestId,
        occurredAt: row.occurredAt.toISOString(),
        metadata: json({
          beforeState: row.beforeState,
          afterState: row.afterState,
        }),
      })),
      nextCursor: nextCursor(offset, input.limit, rows.length),
    };
  }
}

export function createDatabaseAdminRuntime() {
  const connectionString = process.env["VELYQ_DATABASE_URL"];
  if (!connectionString) return null;
  const client = createPrivilegedDatabaseClient({ connectionString });
  const resolver = new DatabasePermissionResolver(client.database);
  const queries = new DatabaseAdminQueries(client.database);
  return {
    authenticator: createSupabaseAdminAuthenticator((userId) =>
      resolver.resolve(userId),
    ),
    queries,
    close: client.close,
  };
}
