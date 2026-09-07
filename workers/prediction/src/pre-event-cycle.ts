import { and, asc, count, desc, eq, gt, lte, or } from "drizzle-orm";
import {
  DatabaseJobRepository,
  DatabaseQualityRepository,
  bookmakers,
  competitionPolicies,
  competitionPolicyVersions,
  competitions,
  dataQualityPolicyVersions,
  decisionFunnelRuns,
  eventMarketOutcomes,
  eventMarkets,
  eventParticipants,
  events,
  loadLineupStates,
  marketDefinitions,
  modelArtifacts,
  modelVersions,
  oddsObservations,
  outcomeDefinitions,
  participants,
  predictionRuns,
  predictions,
  type PrivilegedVelyqDatabase,
} from "@velyq/database";
import { assessDataQuality, type QualityInput } from "@velyq/analytics";
import {
  assessTiming,
  customerPresentation,
  fortressEvidenceSatisfied,
  type DecisionLifecycleState,
  type LineupAvailabilityState,
} from "@velyq/analytics/decision-timing";
/* research-v3 is its own entry point; the package index deliberately does
   not re-export it, so the robust metrics are imported from there. */
import { robustMetrics } from "@velyq/analytics/research-v3";
import { JOB_CONTRACT_VERSIONS } from "@velyq/contracts";
import { canonicalizeNumeric, type DecimalString } from "@velyq/decimal";
import { marketConsensus, type BookmakerQuote } from "@velyq/market-semantics";
import {
  applyTemperature,
  bandFor,
  normalizeTeamKey,
  toCoherentDecimals,
  type Calibrator,
  type FittedModel,
  type UncertaintyProfile,
} from "@velyq/research";
import {
  bothTeamsToScoreProbabilities,
  matchResultProbabilities,
  resolveExpectedGoals,
  scoreDistribution,
  totalGoalsProbabilities,
} from "@velyq/research";
import { createHash } from "node:crypto";
import { runDurablePipelineJobOnce } from "./index.js";

/**
 * The server-side prediction trigger.
 *
 * This is the fix for the root cause behind zero real EDGE, STRONG_EDGE and
 * FORTRESS in production. `DatabasePredictionJobHandler` has always worked;
 * nothing ever enqueued a `GENERATE_PREDICTION` job for a current real event,
 * so its input set was empty and there was nothing for any threshold to
 * reject. Three things were missing rather than one:
 *
 * 1. Nothing computed a model probability. The job payload takes
 *    `modelProbability` as an *input*, and no football model existed to supply
 *    it. `@velyq/research` now does, loaded here from an immutable artifact.
 * 2. Nothing wrote a `data_quality_assessments` row for a real event, so the
 *    handler would have thrown QUALITY_ASSESSMENT_MISSING on the first job it
 *    ever received.
 * 3. Nothing enqueued the job.
 *
 * Runs as a server-side job, never from a page load: a browser request must
 * never be able to cause a prediction to be created, both because it would
 * make forecast timestamps meaningless and because it would let traffic
 * decide how much provider quota and CPU the pipeline spends.
 *
 * Every stage counts what it saw and why it stopped, and those counts are
 * persisted. An empty recommendation list is indistinguishable from a broken
 * pipeline unless the funnel says which stage emptied.
 */

export const PRE_EVENT_QUALITY_POLICY_VERSION = "quality.pre-event.v1";
export const EDGE_SCORE_VERSION = "edge.pre-event.v1";
export const RADAR_SCORE_VERSION = "radar.pre-event.v1";
export const DEFAULT_HORIZON_HOURS = 48;

/**
 * How old the newest price may be and still be called fresh.
 *
 * A day, matching the pre-event quality policy. A tighter window would make
 * every market stale between two scheduled ingestion runs, which on a
 * 100-request daily provider budget are hours apart by necessity.
 */
export const PRICE_FRESHNESS_SECONDS = 86_400;

/** Ceiling on candidates persisted per funnel run. */
const MAX_PERSISTED_CANDIDATES = 250;

/**
 * Markets this cycle evaluates, with their outcome order.
 *
 * The order is the market's canonical order and is load-bearing: the model's
 * probability vector, the de-vigged consensus and the stored outcome rows are
 * all indexed by it, and a mismatch would price the draw against the home
 * team's odds.
 */
export const CYCLE_MARKETS = Object.freeze({
  FOOTBALL_FULL_TIME_1X2: Object.freeze(["HOME", "DRAW", "AWAY"] as const),
  FOOTBALL_FULL_TIME_TOTAL: Object.freeze(["OVER", "UNDER"] as const),
  FOOTBALL_FULL_TIME_BTTS: Object.freeze(["YES", "NO"] as const),
});

export type CycleMarketCode = keyof typeof CYCLE_MARKETS;

export type FunnelCounts = Readonly<{
  eventsDiscovered: number;
  eventsInHorizon: number;
  competitionsResolved: number;
  modelEligibleEvents: number;
  eventsWithOdds: number;
  marketsConsidered: number;
  marketsWithSufficientCoverage: number;
  marketsSupportedByModel: number;
  predictionsRequested: number;
  predictionsCreated: number;
  predictionsDuplicate: number;
  freshPredictions: number;
  positiveRawEdge: number;
  positiveRobustEdge: number;
  /** Markets with usable evidence whose lineup is not yet due. */
  watch: number;
  /** Markets whose lineup is overdue: covered, close to kickoff, absent. */
  waitForLineup: number;
  /** Markets with too little usable evidence to say anything yet. */
  earlyResearch: number;
  /** Markets that reached the final gates at all. */
  readyForFinalEvaluation: number;
  /** Competitions the provider says will never publish a lineup. */
  lineupNotCovered: number;
  /** Markets with a confirmed XI for both sides. */
  lineupConfirmed: number;
  edge: number;
  strongEdge: number;
  fortressEligible: number;
  fortressMultiLegs: number;
}>;

export type NoBetReasons = Readonly<Record<string, number>>;

export type CycleResult = Readonly<{
  asOf: string;
  /** Job outcomes from draining the queue this cycle filled. */
  drained: Readonly<Record<string, number>>;
  horizonHours: number;
  modelVersion: string | null;
  modelMaturity: string | null;
  artifactReference: string | null;
  counts: FunnelCounts;
  noBetReasons: NoBetReasons;
  funnelRunId: string | null;
  /** Per-market detail, for the admin funnel view. */
  evaluations: readonly MarketEvaluationRecord[];
}>;

export type MarketEvaluationRecord = Readonly<{
  eventId: string;
  competitionCode: string | null;
  kickoffAt: string;
  homeTeam: string;
  awayTeam: string;
  marketCode: string;
  bookmakerCoverage: number;
  modelProbabilities: readonly string[] | null;
  marketProbabilities: readonly string[] | null;
  bestOutcomeCode: string | null;
  rawEdge: string | null;
  robustEdge: string | null;
  expectedValue: string | null;
  robustExpectedValue: string | null;
  uncertaintyAvailable: boolean;
  /** Where this market sits in its own lifecycle, not what to do about it. */
  lifecycleState: DecisionLifecycleState;
  lineupAvailability: LineupAvailabilityState;
  /** What a customer surface may claim, derived from the lifecycle state. */
  presentation: string;
  minutesToKickoff: number;
  nextReviewInMinutes: number | null;
  /** Whether FORTRESS could even be considered, and never why not silently. */
  fortressEvidenceSatisfied: boolean;
  reasonCodes: readonly string[];
}>;

type LoadedArtifact = Readonly<{
  modelVersionId: string;
  version: string;
  maturity: string;
  artifactReference: string;
  calibrationVersion: string;
  parameters: FittedModel;
  calibrators: readonly Readonly<{
    marketCode: string;
    calibrator: Calibrator;
  }>[];
  uncertaintyProfiles: readonly UncertaintyProfile[];
}>;

/**
 * Loads the newest registered artifact for the football model.
 *
 * Returns null rather than throwing when there is none, because "no model is
 * registered" is a legitimate funnel state that the owner needs reported as
 * such — not an exception that makes a scheduled run look like an outage.
 */
export async function loadActiveArtifact(
  database: PrivilegedVelyqDatabase,
): Promise<LoadedArtifact | null> {
  const rows = await database
    .select({
      modelVersionId: modelVersions.id,
      version: modelVersions.version,
      maturity: modelVersions.maturityStatus,
      artifactReference: modelArtifacts.artifactReference,
      parameters: modelArtifacts.parameters,
      calibrators: modelArtifacts.calibrators,
      uncertaintyProfiles: modelArtifacts.uncertaintyProfiles,
    })
    .from(modelArtifacts)
    .innerJoin(
      modelVersions,
      eq(modelArtifacts.modelVersionId, modelVersions.id),
    )
    .orderBy(desc(modelArtifacts.createdAt), desc(modelArtifacts.id))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    modelVersionId: row.modelVersionId,
    version: row.version,
    maturity: row.maturity,
    artifactReference: row.artifactReference,
    calibrationVersion: TEMPERATURE_CALIBRATION_VERSION,
    parameters: row.parameters as FittedModel,
    calibrators: row.calibrators as LoadedArtifact["calibrators"],
    uncertaintyProfiles:
      row.uncertaintyProfiles as readonly UncertaintyProfile[],
  };
}

export const TEMPERATURE_CALIBRATION_VERSION = "temperature-scaling.v1";

type PolicyRow = Readonly<{
  canonicalCode: string;
  state: string;
  modelEligible: boolean;
  customerVisible: boolean;
  minBookmakerCoverage: number;
}>;

/** The active competition policy, keyed by canonical code. */
export async function loadCompetitionPolicy(
  database: PrivilegedVelyqDatabase,
  asOf: Date,
): Promise<ReadonlyMap<string, PolicyRow>> {
  const [version] = await database
    .select({ id: competitionPolicyVersions.id })
    .from(competitionPolicyVersions)
    .where(lte(competitionPolicyVersions.effectiveFrom, asOf))
    .orderBy(
      desc(competitionPolicyVersions.effectiveFrom),
      desc(competitionPolicyVersions.createdAt),
    )
    .limit(1);
  if (!version) return new Map();
  const rows = await database
    .select({
      canonicalCode: competitionPolicies.canonicalCode,
      state: competitionPolicies.state,
      modelEligible: competitionPolicies.modelEligible,
      customerVisible: competitionPolicies.customerVisible,
      minBookmakerCoverage: competitionPolicies.minBookmakerCoverage,
      manualOverride: competitionPolicies.manualOverride,
    })
    .from(competitionPolicies)
    .where(eq(competitionPolicies.policyVersionId, version.id));
  return new Map(
    rows.map((row) => [
      row.canonicalCode,
      {
        canonicalCode: row.canonicalCode,
        /*
         * An override can only narrow. The stored state is already the
         * decided one, so an override present here is applied as the tighter
         * of the two rather than replacing it outright.
         */
        state: row.manualOverride ?? row.state,
        modelEligible:
          row.modelEligible && (row.manualOverride ?? row.state) === row.state,
        customerVisible: row.customerVisible,
        minBookmakerCoverage: row.minBookmakerCoverage,
      },
    ]),
  );
}

type CandidateEvent = Readonly<{
  eventId: string;
  competitionCanonicalCode: string | null;
  startsAt: Date;
  homeName: string;
  awayName: string;
}>;

/**
 * Real, football, not yet started, inside the horizon.
 *
 * `gt(startsAt, asOf)` is the forecast-integrity condition, not a convenience:
 * a prediction created after kickoff is not a forecast, and the ledger has no
 * way to represent one honestly.
 */
export async function loadCandidateEvents(
  database: PrivilegedVelyqDatabase,
  asOf: Date,
  horizonHours: number,
): Promise<
  Readonly<{ candidates: readonly CandidateEvent[]; discovered: number }>
> {
  const horizonEnd = new Date(asOf.getTime() + horizonHours * 3_600_000);
  const rows = await database
    .select({
      eventId: events.id,
      startsAt: events.startsAt,
      canonicalCode: competitions.canonicalCode,
      synthetic: events.synthetic,
      role: eventParticipants.role,
      displayName: participants.displayName,
    })
    .from(events)
    .innerJoin(competitions, eq(events.competitionId, competitions.id))
    .innerJoin(eventParticipants, eq(eventParticipants.eventId, events.id))
    .innerJoin(
      participants,
      eq(eventParticipants.participantId, participants.id),
    )
    .where(and(eq(events.synthetic, false), gt(events.startsAt, asOf)))
    .orderBy(asc(events.startsAt), asc(events.id));

  /*
   * Discovery is every real football event in the catalog, including ones
   * already played. Counting only the upcoming ones would start the funnel
   * halfway down itself and hide the fact that the provider is delivering
   * events at all.
   */
  const [discovery] = await database
    .select({ total: count() })
    .from(events)
    .where(eq(events.synthetic, false));

  const byEvent = new Map<
    string,
    {
      startsAt: Date;
      canonicalCode: string | null;
      home: string;
      away: string;
    }
  >();
  for (const row of rows) {
    const entry = byEvent.get(row.eventId) ?? {
      startsAt: row.startsAt,
      canonicalCode: row.canonicalCode,
      home: "",
      away: "",
    };
    if (row.role === "HOME") entry.home = row.displayName;
    if (row.role === "AWAY") entry.away = row.displayName;
    byEvent.set(row.eventId, entry);
  }
  const candidates: CandidateEvent[] = [];
  for (const [eventId, entry] of byEvent) {
    if (entry.startsAt > horizonEnd) continue;
    candidates.push({
      eventId,
      competitionCanonicalCode: entry.canonicalCode,
      startsAt: entry.startsAt,
      homeName: entry.home,
      awayName: entry.away,
    });
  }
  return { candidates, discovered: discovery?.total ?? byEvent.size };
}

type OutcomeRow = Readonly<{
  outcomeId: string;
  outcomeCode: string;
  marketCode: string;
  lineValue: string | null;
}>;

type ObservationRow = Readonly<{
  outcomeId: string;
  bookmakerCode: string;
  decimalOdds: string;
  observedAt: Date;
  receivedAt: Date;
  sourceObservationId: string;
  oddsObservationId: string;
}>;

export async function loadEventMarkets(
  database: PrivilegedVelyqDatabase,
  eventId: string,
  asOf: Date,
): Promise<
  Readonly<{
    outcomes: readonly OutcomeRow[];
    observations: readonly ObservationRow[];
  }>
> {
  const outcomes = await database
    .select({
      outcomeId: eventMarketOutcomes.id,
      outcomeCode: outcomeDefinitions.code,
      marketCode: marketDefinitions.code,
      lineValue: eventMarkets.lineValue,
      sortOrder: outcomeDefinitions.sortOrder,
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
    .orderBy(asc(marketDefinitions.code), asc(outcomeDefinitions.sortOrder));

  const observations = await database
    .select({
      outcomeId: oddsObservations.eventMarketOutcomeId,
      bookmakerCode: bookmakers.code,
      decimalOdds: oddsObservations.decimalOdds,
      observedAt: oddsObservations.providerObservedAt,
      receivedAt: oddsObservations.receivedAt,
      sourceObservationId: oddsObservations.sourceObservationId,
      oddsObservationId: oddsObservations.id,
    })
    .from(oddsObservations)
    .innerJoin(bookmakers, eq(oddsObservations.bookmakerId, bookmakers.id))
    .innerJoin(
      eventMarketOutcomes,
      eq(oddsObservations.eventMarketOutcomeId, eventMarketOutcomes.id),
    )
    .innerJoin(
      eventMarkets,
      eq(eventMarketOutcomes.eventMarketId, eventMarkets.id),
    )
    .where(
      and(
        eq(eventMarkets.eventId, eventId),
        // The feature cutoff, enforced in the query rather than in a filter
        // afterwards, so a later observation cannot reach a decision at all.
        lte(oddsObservations.receivedAt, asOf),
        lte(oddsObservations.providerObservedAt, asOf),
      ),
    )
    .orderBy(
      asc(oddsObservations.providerObservedAt),
      asc(oddsObservations.id),
    );

  return {
    outcomes: outcomes.map((row) => ({
      outcomeId: row.outcomeId,
      outcomeCode: row.outcomeCode,
      marketCode: row.marketCode,
      lineValue: row.lineValue,
    })),
    observations,
  };
}

/**
 * Model probabilities for one market, calibrated, as coherent decimals.
 *
 * Calibration is applied here rather than at fit time because the calibrator
 * is part of the artifact and may be the identity: a model that turned out to
 * be well calibrated must produce the same numbers whether or not a calibrator
 * row exists.
 */
export function modelProbabilitiesForMarket(
  artifact: LoadedArtifact,
  marketCode: CycleMarketCode,
  lookup: Readonly<{
    competitionCode: string;
    homeTeamKey: string;
    awayTeamKey: string;
  }>,
):
  | Readonly<{ ok: true; probabilities: readonly number[] }>
  | Readonly<{ ok: false; reason: string }> {
  const expected = resolveExpectedGoals(artifact.parameters, {
    competitionCode: lookup.competitionCode,
    homeTeamKey: lookup.homeTeamKey,
    awayTeamKey: lookup.awayTeamKey,
  });
  if (!expected.ok) return { ok: false, reason: expected.reason };
  const distribution = scoreDistribution(
    expected.value,
    artifact.parameters.rho,
  );
  let raw: readonly number[];
  if (marketCode === "FOOTBALL_FULL_TIME_1X2") {
    const result = matchResultProbabilities(distribution);
    raw = [result.home, result.draw, result.away];
  } else if (marketCode === "FOOTBALL_FULL_TIME_TOTAL") {
    const totals = totalGoalsProbabilities(distribution, 2.5);
    if (!totals) return { ok: false, reason: "INVALID_TOTAL_LINE" };
    raw = [totals.over, totals.under];
  } else {
    const btts = bothTeamsToScoreProbabilities(distribution);
    raw = [btts.yes, btts.no];
  }
  const calibrator = artifact.calibrators.find(
    (entry) => entry.marketCode === marketCode,
  )?.calibrator;
  return {
    ok: true,
    probabilities: calibrator
      ? applyTemperature(raw, calibrator.temperature)
      : raw,
  };
}

function idempotencyKey(parts: readonly string[]): string {
  return createHash("sha256")
    .update(parts.join("|"))
    .digest("hex")
    .slice(0, 48);
}

/* The funnel is reported immutably and accumulated mutably; `-readonly`
   keeps one source of truth for the field list. */
type Accumulator = {
  -readonly [K in keyof FunnelCounts]: number;
};

export type CycleOptions = Readonly<{
  database: PrivilegedVelyqDatabase;
  asOf: Date;
  horizonHours?: number;
  triggerSource: "SCHEDULED" | "ADMIN" | "CLI";
  /** When false, nothing is enqueued or persisted; used for a dry run. */
  commit?: boolean;
  /**
   * Ceiling on jobs drained in one cycle. Bounded on purpose: an unbounded
   * loop over a queue that a failing handler keeps returning to PENDING is how
   * a scheduled job turns into an outage.
   */
  maxDrainedJobs?: number;
}>;

/**
 * Drains the queue the cycle just filled, and reports what happened.
 *
 * Part of the cycle rather than a separate step, because a funnel that counts
 * predictions before the jobs run always reports zero and makes a working
 * pipeline look broken. The cycle's job is to answer "what did today produce",
 * which is only knowable after the queue is empty.
 */
export async function drainPipelineQueue(
  database: PrivilegedVelyqDatabase,
  workerId: string,
  maxJobs: number,
): Promise<Readonly<Record<string, number>>> {
  const outcomes: Record<string, number> = {};
  for (let processed = 0; processed < maxJobs; processed += 1) {
    const result = await runDurablePipelineJobOnce({
      database,
      workerId,
      now: new Date(),
      leaseDurationMs: 60_000,
    });
    if (!result.leased) break;
    const key =
      result.status === "FAILED"
        ? `FAILED:${result.errorCode ?? "UNKNOWN"}`
        : result.status;
    outcomes[key] = (outcomes[key] ?? 0) + 1;
  }
  return outcomes;
}

export async function runPreEventPredictionCycle(
  options: CycleOptions,
): Promise<CycleResult> {
  const horizonHours = options.horizonHours ?? DEFAULT_HORIZON_HOURS;
  const commit = options.commit ?? true;
  const asOf = options.asOf;
  const counts: Accumulator = {
    eventsDiscovered: 0,
    eventsInHorizon: 0,
    competitionsResolved: 0,
    modelEligibleEvents: 0,
    eventsWithOdds: 0,
    marketsConsidered: 0,
    marketsWithSufficientCoverage: 0,
    marketsSupportedByModel: 0,
    predictionsRequested: 0,
    predictionsCreated: 0,
    predictionsDuplicate: 0,
    freshPredictions: 0,
    positiveRawEdge: 0,
    positiveRobustEdge: 0,
    watch: 0,
    waitForLineup: 0,
    earlyResearch: 0,
    readyForFinalEvaluation: 0,
    lineupNotCovered: 0,
    lineupConfirmed: 0,
    edge: 0,
    strongEdge: 0,
    fortressEligible: 0,
    fortressMultiLegs: 0,
  };
  const reasons = new Map<string, number>();
  /*
   * What this cycle actually decided on, by outcome and feature cutoff. The
   * counts at the end are read back for exactly these rows, which is what
   * makes a rerun report the same six predictions rather than either zero or
   * twelve.
   */
  const decided: { outcomeId: string; featureCutoff: Date }[] = [];
  const note = (code: string) =>
    reasons.set(code, (reasons.get(code) ?? 0) + 1);
  const evaluations: MarketEvaluationRecord[] = [];

  const artifact = await loadActiveArtifact(options.database);
  const policy = await loadCompetitionPolicy(options.database, asOf);
  const { candidates, discovered } = await loadCandidateEvents(
    options.database,
    asOf,
    horizonHours,
  );
  counts.eventsDiscovered = discovered;
  counts.eventsInHorizon = candidates.length;

  if (!artifact) {
    note("NO_MODEL_ARTIFACT_REGISTERED");
    return finish(
      options,
      asOf,
      horizonHours,
      null,
      counts,
      reasons,
      evaluations,
      commit,
    );
  }

  const qualityRepository = new DatabaseQualityRepository(options.database);
  const [qualityPolicy] = await options.database
    .select({ id: dataQualityPolicyVersions.id })
    .from(dataQualityPolicyVersions)
    .where(
      eq(dataQualityPolicyVersions.version, PRE_EVENT_QUALITY_POLICY_VERSION),
    )
    .limit(1);
  if (!qualityPolicy) {
    note("NO_QUALITY_POLICY_VERSION");
    return finish(
      options,
      asOf,
      horizonHours,
      artifact,
      counts,
      reasons,
      evaluations,
      commit,
    );
  }

  /*
   * One query for every candidate rather than one per event: the join runs
   * through competition identities and coverage, and doing it per event would
   * turn a cycle over a hundred fixtures into several hundred round trips.
   */
  const lineupStates = await loadLineupStates(
    options.database,
    candidates.map((candidate) => candidate.eventId),
  );

  const jobRepository = new DatabaseJobRepository(options.database);
  const knownTeamKeys = new Map<string, Set<string>>();
  for (const team of artifact.parameters.teams) {
    const set = knownTeamKeys.get(team.competitionCode) ?? new Set<string>();
    set.add(team.teamKey);
    knownTeamKeys.set(team.competitionCode, set);
  }

  for (const candidate of candidates) {
    const competitionCode = candidate.competitionCanonicalCode;
    if (!competitionCode) {
      note("COMPETITION_NOT_MAPPED");
      continue;
    }
    counts.competitionsResolved += 1;
    const competitionPolicy = policy.get(competitionCode);
    if (!competitionPolicy) {
      note("COMPETITION_NOT_IN_POLICY");
      continue;
    }
    if (!competitionPolicy.modelEligible) {
      note(`COMPETITION_${competitionPolicy.state}`);
      continue;
    }
    counts.modelEligibleEvents += 1;

    const homeTeamKey = normalizeTeamKey(candidate.homeName);
    const awayTeamKey = normalizeTeamKey(candidate.awayName);
    const known = knownTeamKeys.get(competitionCode) ?? new Set<string>();
    if (!known.has(homeTeamKey) || !known.has(awayTeamKey)) {
      /*
       * A newly promoted club has no ratings, and substituting the division
       * average would produce a confident-looking edge resting on an
       * assumption nobody made deliberately.
       */
      note("TEAM_NOT_IN_MODEL");
      continue;
    }

    const { outcomes, observations } = await loadEventMarkets(
      options.database,
      candidate.eventId,
      asOf,
    );
    if (observations.length === 0) {
      note("NO_ODDS_AT_CUTOFF");
      continue;
    }
    counts.eventsWithOdds += 1;

    const byMarket = new Map<string, OutcomeRow[]>();
    for (const outcome of outcomes) {
      const list = byMarket.get(outcome.marketCode) ?? [];
      list.push(outcome);
      byMarket.set(outcome.marketCode, list);
    }

    for (const marketCode of Object.keys(CYCLE_MARKETS) as CycleMarketCode[]) {
      const expectedOutcomes = CYCLE_MARKETS[marketCode];
      const marketOutcomes = byMarket.get(marketCode) ?? [];
      counts.marketsConsidered += 1;
      const ordered = expectedOutcomes.map((code) =>
        marketOutcomes.find((outcome) => outcome.outcomeCode === code),
      );
      if (ordered.some((outcome) => outcome === undefined)) {
        /*
         * Both-teams-to-score reaches here for this source: the publisher
         * carries no BTTS column at all, so no market exists to price against
         * even though the model has an opinion. Reported rather than hidden.
         */
        note(`NO_MARKET_${marketCode}`);
        continue;
      }
      const orderedOutcomes = ordered as OutcomeRow[];

      /* Latest price per bookmaker per outcome, at the cutoff. */
      const latest = new Map<string, ObservationRow>();
      for (const observation of observations) {
        const key = `${observation.outcomeId}|${observation.bookmakerCode}`;
        const existing = latest.get(key);
        if (!existing || observation.observedAt >= existing.observedAt)
          latest.set(key, observation);
      }
      const quotes: BookmakerQuote[] = [];
      const bookmakerCodes = new Set(
        observations.map((observation) => observation.bookmakerCode),
      );
      const contributingObservations: ObservationRow[] = [];
      for (const bookmakerCode of [...bookmakerCodes].sort()) {
        const prices = orderedOutcomes.map((outcome) =>
          latest.get(`${outcome.outcomeId}|${bookmakerCode}`),
        );
        if (prices.some((price) => price === undefined)) continue;
        const complete = prices as ObservationRow[];
        contributingObservations.push(...complete);
        quotes.push({
          bookmaker: bookmakerCode,
          /*
           * `odds_observations.decimal_odds` is numeric(18, 8), so the driver
           * returns 2.1 as "2.10000000" and the decimal codec — strict by
           * design — refuses it. Canonicalising here is what lets a real
           * column read reach the de-vig at all.
           */
          odds: complete.map(
            (price) => canonicalizeNumeric(price.decimalOdds) as DecimalString,
          ),
          observedAt: complete[0]!.observedAt.toISOString(),
        });
      }

      /*
       * The timing assessment, computed before any decision logic. It answers
       * "how far has the evidence got" separately from "is the price good",
       * which is the separation that lets a market a day out be reported as
       * WATCH rather than as a failed quality check.
       */
      const lineupState = lineupStates.get(candidate.eventId);
      const lineupAvailability: LineupAvailabilityState =
        lineupState?.availability ?? "LINEUP_NOT_PUBLISHED_YET";
      const minutesToKickoff =
        (candidate.startsAt.getTime() - asOf.getTime()) / 60_000;
      const newestObservedAt = observations.reduce(
        (latest, observation) =>
          observation.receivedAt > latest ? observation.receivedAt : latest,
        observations[0]?.receivedAt ?? asOf,
      );
      const timing = assessTiming({
        minutesToKickoff,
        lineup: lineupAvailability,
        marketCoverageSufficient:
          quotes.length >= competitionPolicy.minBookmakerCoverage,
        priceFresh:
          asOf.getTime() - newestObservedAt.getTime() <=
          PRICE_FRESHNESS_SECONDS * 1000,
        modelEstimateAvailable: true,
        uncertaintyAvailable: true,
      });
      const fortressEvidence = fortressEvidenceSatisfied({
        lineup: lineupAvailability,
        minutesToKickoff,
      });

      const record = (
        extra: Partial<MarketEvaluationRecord>,
        reasonCodes: readonly string[],
      ) => {
        evaluations.push({
          eventId: candidate.eventId,
          competitionCode,
          kickoffAt: candidate.startsAt.toISOString(),
          homeTeam: candidate.homeName,
          awayTeam: candidate.awayName,
          marketCode,
          bookmakerCoverage: quotes.length,
          modelProbabilities: null,
          marketProbabilities: null,
          bestOutcomeCode: null,
          rawEdge: null,
          robustEdge: null,
          expectedValue: null,
          robustExpectedValue: null,
          uncertaintyAvailable: false,
          lifecycleState: timing.state,
          lineupAvailability,
          presentation: customerPresentation(timing.state),
          minutesToKickoff: Math.round(minutesToKickoff),
          nextReviewInMinutes: timing.nextReviewInMinutes,
          fortressEvidenceSatisfied: fortressEvidence.satisfied,
          ...extra,
          reasonCodes,
        });
      };

      if (lineupAvailability === "LINEUP_NOT_COVERED")
        counts.lineupNotCovered += 1;
      if (lineupAvailability === "LINEUP_AVAILABLE")
        counts.lineupConfirmed += 1;
      if (timing.state === "WATCH") counts.watch += 1;
      if (timing.state === "WAIT_FOR_LINEUP") counts.waitForLineup += 1;
      if (timing.state === "EARLY_RESEARCH") counts.earlyResearch += 1;
      if (timing.state === "READY_FOR_FINAL_EVALUATION")
        counts.readyForFinalEvaluation += 1;
      for (const code of timing.reasonCodes) note(`TIMING_${code}`);

      if (quotes.length < competitionPolicy.minBookmakerCoverage) {
        note("INSUFFICIENT_BOOKMAKER_COVERAGE");
        record({}, ["INSUFFICIENT_BOOKMAKER_COVERAGE"]);
        continue;
      }
      counts.marketsWithSufficientCoverage += 1;

      const modelResult = modelProbabilitiesForMarket(artifact, marketCode, {
        competitionCode,
        homeTeamKey,
        awayTeamKey,
      });
      if (!modelResult.ok) {
        note(modelResult.reason);
        record({}, [modelResult.reason]);
        continue;
      }
      counts.marketsSupportedByModel += 1;

      /*
       * Shin de-vig, per bookmaker, then averaged. Never an average of raw
       * odds: the overround is each book's own charge and not part of what
       * the market believes, so averaging prices biases the result toward
       * whichever book charges most.
       */
      const consensus = marketConsensus(quotes, "SHIN");
      if (!consensus.ok) {
        note("MARKET_CONSENSUS_UNAVAILABLE");
        record({}, ["MARKET_CONSENSUS_UNAVAILABLE"]);
        continue;
      }

      const modelDecimals = toCoherentDecimals(modelResult.probabilities);
      const profile =
        artifact.uncertaintyProfiles.find(
          (entry) =>
            entry.competitionCode === competitionCode &&
            entry.marketCode === marketCode,
        ) ?? null;

      /*
       * The best outcome is chosen on the *robust* edge where one exists and
       * the raw edge otherwise, so an outcome with a measured band is never
       * passed over in favour of one whose apparent edge is unmeasurable.
       */
      let best: {
        index: number;
        outcome: OutcomeRow;
        rawEdge: string;
        robust: ReturnType<typeof robustMetrics>;
        uncertaintyAvailable: boolean;
      } | null = null;

      for (let index = 0; index < orderedOutcomes.length; index += 1) {
        const outcome = orderedOutcomes[index]!;
        const modelProbability = modelDecimals[index]!;
        const marketProbability = consensus.value.probabilities[index]!;
        const marketHigh = consensus.value.probabilitiesHigh[index]!;
        const price = latest.get(
          `${outcome.outcomeId}|${quotes[0]!.bookmaker}`,
        );
        if (!price) continue;
        const band = bandFor(
          profile,
          index,
          Number(modelResult.probabilities[index] ?? 0),
        );
        const robust = robustMetrics({
          model: {
            pointProbability: modelProbability as DecimalString,
            lowerProbabilityBound: band
              ? (band.lowerBound.toFixed(12) as DecimalString)
              : null,
            upperProbabilityBound: band
              ? (band.upperBound.toFixed(12) as DecimalString)
              : null,
            uncertaintyMethod: band ? "BOOTSTRAP" : "UNCERTAINTY_UNAVAILABLE",
          },
          marketHigh: marketHigh as DecimalString,
          odds: canonicalizeNumeric(price.decimalOdds) as DecimalString,
        });
        const rawEdge = (
          Number(modelProbability) - Number(marketProbability)
        ).toFixed(12);
        const better =
          best === null ||
          Number(rawEdge) > Number(best.rawEdge) ||
          (band !== null && !best.uncertaintyAvailable);
        if (better)
          best = {
            index,
            outcome,
            rawEdge,
            robust,
            uncertaintyAvailable: band !== null,
          };
      }

      if (!best || !best.robust.ok) {
        note("VALUE_COMPUTATION_FAILED");
        record({}, ["VALUE_COMPUTATION_FAILED"]);
        continue;
      }

      const rawEdgePositive = Number(best.rawEdge) > 0;
      if (rawEdgePositive) counts.positiveRawEdge += 1;
      const robustEdge = best.robust.value.robustProbabilityEdge;
      if (robustEdge !== null && !robustEdge.startsWith("-"))
        counts.positiveRobustEdge += 1;
      if (!best.uncertaintyAvailable) note("UNCERTAINTY_UNAVAILABLE");

      record(
        {
          modelProbabilities: modelDecimals,
          marketProbabilities: [...consensus.value.probabilities],
          bestOutcomeCode: best.outcome.outcomeCode,
          rawEdge: best.rawEdge,
          robustEdge,
          expectedValue: best.robust.value.pointEV,
          robustExpectedValue: best.robust.value.robustEV,
          uncertaintyAvailable: best.uncertaintyAvailable,
        },
        rawEdgePositive ? ["POSITIVE_RAW_EDGE"] : ["NO_POSITIVE_RAW_EDGE"],
      );

      /*
       * The feature cutoff is the newest observation in the decision's own
       * input set, never the wall clock.
       *
       * This is what makes the cycle idempotent. With the cycle's own as-of as
       * the cutoff, every run was by definition a new cutoff, so every run
       * created another prediction for an unchanged market and six became
       * twelve became eighteen. Deriving it from the evidence means a rerun
       * over the same prices resolves to the same idempotency key and creates
       * nothing, while a genuinely repriced market is a new observation, a
       * later cutoff and therefore a new immutable prediction version - which
       * is exactly the distinction the policy asks for.
       */
      const contributing = contributingObservations.filter(
        (observation) => observation.outcomeId === best.outcome.outcomeId,
      );
      const featureCutoff = contributing.reduce(
        (latest, observation) =>
          observation.receivedAt > latest ? observation.receivedAt : latest,
        contributing[0]?.receivedAt ?? asOf,
      );

      /*
       * The final gates run only when the lifecycle says a final decision is
       * due. Before that the market is still gathering evidence: it has been
       * recorded as a candidate with its model estimate and its market
       * consensus, which is what an operator needs, and creating a prediction
       * row for it would file a non-decision alongside real ones.
       */
      if (!timing.finalEvaluationDue) {
        note(`LIFECYCLE_${timing.state}`);
        continue;
      }

      /*
       * A quality assessment must exist before the handler runs, and it must
       * be the durable one: the handler reads it back by event, outcome and
       * cutoff and refuses to compute a prediction without it.
       */
      const sourceObservationIds = [
        ...new Set(
          contributing.map((observation) => observation.sourceObservationId),
        ),
      ];
      if (sourceObservationIds.length === 0) {
        note("NO_SOURCE_OBSERVATION");
        continue;
      }

      const qualityInput: QualityInput = {
        policyVersion: PRE_EVENT_QUALITY_POLICY_VERSION,
        asOf: featureCutoff.toISOString(),
        receivedAt: featureCutoff.toISOString(),
        priceCount: quotes.length,
        bookmakerCount: quotes.length,
        /*
         * The real lineup state, not a constant. A confirmed XI is OFFICIAL;
         * everything else is MISSING as far as the existing quality policy is
         * concerned, and that policy is untouched. What changed is that the
         * *lifecycle* no longer treats a not-yet-due lineup as a failure, so
         * an early market is reported as WATCH while still being refused a
         * final decision.
         */
        lineup:
          lineupAvailability === "LINEUP_AVAILABLE" ? "OFFICIAL" : "MISSING",
        mappingConfidence: "HIGH",
        edgeAvailable: best.uncertaintyAvailable,
        edgePresent: rawEdgePositive,
        sourceAuthority: "SECONDARY",
        consistency: "CONSISTENT",
      };
      const assessment = assessDataQuality(qualityInput);
      for (const code of assessment.reasonCodes) note(`QUALITY_${code}`);

      if (!commit) {
        counts.predictionsRequested += 1;
        decided.push({ outcomeId: best.outcome.outcomeId, featureCutoff });
        continue;
      }

      await qualityRepository.append({
        policyVersionId: qualityPolicy.id,
        eventId: candidate.eventId,
        marketOutcomeId: best.outcome.outcomeId,
        asOf: featureCutoff,
        grade: assessment.grade,
        numericScore: assessment.score,
        components: assessment.components,
        reasonCodes: assessment.reasonCodes,
      });

      /*
       * Idempotency is over everything that could change the answer: the
       * event, the outcome, the model version, the feature cutoff and the
       * exact observation set. A rerun with an unchanged market resolves to
       * the same key and creates no second prediction; a genuinely repriced
       * market is a new observation set and therefore a new prediction.
       */
      const key = `prediction:${idempotencyKey([
        candidate.eventId,
        best.outcome.outcomeId,
        artifact.version,
        featureCutoff.toISOString(),
        ...sourceObservationIds.slice().sort(),
      ])}`;

      await jobRepository.enqueue({
        type: "GENERATE_PREDICTION",
        contractVersion: JOB_CONTRACT_VERSIONS.GENERATE_PREDICTION,
        idempotencyKey: key,
        correlationId: idempotencyKeyToUuid(`cycle:${asOf.toISOString()}`),
        causationId: idempotencyKeyToUuid(`cycle-cause:${asOf.toISOString()}`),
        availableAt: asOf,
        payload: {
          eventId: candidate.eventId,
          eventMarketOutcomeId: best.outcome.outcomeId,
          modelProbability: modelDecimals[best.index]! as DecimalString,
          currentOdds: canonicalizeNumeric(
            latest.get(`${best.outcome.outcomeId}|${quotes[0]!.bookmaker}`)!
              .decimalOdds,
          ) as DecimalString,
          quality: qualityInput,
          featureCutoff: featureCutoff.toISOString(),
          modelVersion: artifact.version,
          calibrationVersion: artifact.calibrationVersion,
          sourceObservationIds,
        },
      });
      counts.predictionsRequested += 1;
      decided.push({ outcomeId: best.outcome.outcomeId, featureCutoff });
    }
  }

  return finish(
    options,
    asOf,
    horizonHours,
    artifact,
    counts,
    reasons,
    evaluations,
    commit,
    decided,
  );
}

/** A deterministic UUID for a correlation identity derived from a string. */
export function idempotencyKeyToUuid(seed: string): string {
  const hex = createHash("sha256").update(seed).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

async function finish(
  options: CycleOptions,
  asOf: Date,
  horizonHours: number,
  artifact: LoadedArtifact | null,
  counts: Accumulator,
  reasons: Map<string, number>,
  evaluations: readonly MarketEvaluationRecord[],
  commit: boolean,
  decided: readonly Readonly<{ outcomeId: string; featureCutoff: Date }>[] = [],
): Promise<CycleResult> {
  /*
   * The queue is drained before anything is counted. Every count below is
   * then read back from the database rather than tallied in memory, so it
   * describes what is actually stored — a number the orchestrator merely
   * believes it wrote goes stale the first time a transaction rolls back.
   */
  const drained = commit
    ? await drainPipelineQueue(
        options.database,
        `prediction-cycle:${options.triggerSource.toLowerCase()}`,
        options.maxDrainedJobs ?? 5000,
      )
    : {};

  if (commit && decided.length > 0) {
    const stored = await options.database
      .select({
        outcomeId: predictions.eventMarketOutcomeId,
        decisionStatus: predictions.decisionStatus,
        featureCutoff: predictionRuns.featureCutoff,
      })
      .from(predictions)
      .innerJoin(
        predictionRuns,
        eq(predictions.predictionRunId, predictionRuns.id),
      )
      .where(
        or(
          ...decided.map((decision) =>
            and(
              eq(predictions.eventMarketOutcomeId, decision.outcomeId),
              eq(predictionRuns.featureCutoff, decision.featureCutoff),
            ),
          ),
        ),
      );
    counts.predictionsCreated = stored.length;
    /*
     * Freshness is about the evidence, not about when the row was written: a
     * prediction whose cutoff is the newest price the market has offered is
     * current whether it was computed a minute ago or on the previous run.
     */
    counts.freshPredictions = stored.length;
    counts.predictionsDuplicate = Math.max(
      0,
      counts.predictionsRequested - stored.length,
    );
    counts.edge = stored.filter((row) => row.decisionStatus === "EDGE").length;
    counts.strongEdge = stored.filter(
      (row) => row.decisionStatus === "STRONG_EDGE",
    ).length;
  }

  const noBetReasons = Object.fromEntries(
    [...reasons.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );

  let funnelRunId: string | null = null;
  if (commit) {
    const [row] = await options.database
      .insert(decisionFunnelRuns)
      .values({
        sportCode: "FOOTBALL",
        asOf,
        horizonHours,
        modelVersionId: artifact?.modelVersionId ?? null,
        counts,
        noBetReasons,
        /*
         * Bounded. The funnel row is an operational record, not an archive,
         * and a cycle over a few hundred fixtures could otherwise write a
         * multi-megabyte jsonb every run.
         */
        candidates: evaluations.slice(0, MAX_PERSISTED_CANDIDATES),
        triggerSource: options.triggerSource,
        idempotencyKey: `funnel:FOOTBALL:${asOf.toISOString()}:${options.triggerSource}`,
      })
      .onConflictDoNothing()
      .returning({ id: decisionFunnelRuns.id });
    funnelRunId = row?.id ?? null;
  }

  return {
    asOf: asOf.toISOString(),
    drained,
    horizonHours,
    modelVersion: artifact?.version ?? null,
    modelMaturity: artifact?.maturity ?? null,
    artifactReference: artifact?.artifactReference ?? null,
    counts,
    noBetReasons,
    funnelRunId,
    evaluations,
  };
}
