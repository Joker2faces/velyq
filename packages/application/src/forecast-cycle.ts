import type { DataQualityAssessment } from "@velyq/analytics";
import {
  DEFAULT_DECISION_POLICY,
  evaluateDecision,
  type DecisionPolicy,
} from "@velyq/analytics/decision-engine";
import type { TeamResolution } from "@velyq/domain";
import {
  modelProbabilitiesFor,
  resolveExpectedGoals,
  type ModelArtifact,
  type SupportedMarketCode,
} from "@velyq/research";

/**
 * The one concrete gap this closes: nothing in the running application ever
 * called the model and wrote a `predictions` row. Every piece this wires
 * together (identity resolution, Dixon-Coles inference, the decision
 * engine, the append-only repositories) already existed and was already
 * tested in isolation -- this is the runtime path that actually calls them,
 * for FT 1X2 and FT Over/Under 2.5, end to end.
 *
 * Deliberately port-based (every DB/model access comes in through `deps`)
 * so the orchestration logic -- numerical invariants, per-fixture failure
 * isolation, maturity gating, reason codes -- is unit-testable without a
 * database, while a thin adapter (not this file) wires the real
 * repositories for production and for the DB-backed E2E proof.
 *
 * Two markets, not one, and deliberately generalised rather than duplicated:
 * `resolveExpectedGoals` and the Dixon-Coles fit are shared by both -- a
 * fixture is either model-eligible or it is not, independent of which market
 * is being priced -- so eligibility is resolved once per fixture and the
 * market loop only ever asks "what does this market's own probability
 * function say", via `modelProbabilitiesFor(market, ...)`, which
 * `@velyq/research` already implements for both (it is what the backtest and
 * the model audit evaluate). Nothing here invents a new model; it calls the
 * same one twice with a different market code.
 */

/**
 * The two markets this cycle prices. A strict subset of
 * `@velyq/research`'s `SupportedMarketCode` (which also has BTTS, used only
 * by the backtest) -- VELYQ's mandate is to get FT 1X2 and FT Over/Under 2.5
 * fully correct before considering a third, not to wire every market the
 * research package happens to know how to score.
 */
export type ForecastCycleMarket = Extract<
  SupportedMarketCode,
  "FOOTBALL_FULL_TIME_1X2" | "FOOTBALL_FULL_TIME_TOTAL"
>;

export type ForecastCycleSelection =
  "HOME" | "DRAW" | "AWAY" | "OVER" | "UNDER";

/**
 * The markets this cycle prices, and the selections each one produces, in
 * the same order `modelProbabilitiesFor` returns its probability vector --
 * that ordering is what lets a plain index lookup turn the vector into a
 * per-selection probability with no market-specific branching below.
 */
export const FORECAST_CYCLE_MARKETS: Readonly<
  Record<ForecastCycleMarket, readonly ForecastCycleSelection[]>
> = Object.freeze({
  FOOTBALL_FULL_TIME_1X2: Object.freeze(["HOME", "DRAW", "AWAY"] as const),
  FOOTBALL_FULL_TIME_TOTAL: Object.freeze(["OVER", "UNDER"] as const),
});

export type ForecastCycleFixture = Readonly<{
  eventId: string;
  /** The provider-facing competition code passed to identity resolution. */
  providerCompetitionCode: string;
  homeTeam: Readonly<{ sourceName: string; normalizedName: string }>;
  awayTeam: Readonly<{ sourceName: string; normalizedName: string }>;
  /**
   * Every selection this fixture has a wired event-market outcome for, across
   * both markets. Safe as one flat map because the five selection codes are
   * globally distinct -- HOME/DRAW/AWAY never collide with OVER/UNDER -- so
   * no market qualifier is needed on the key.
   */
  eventMarketOutcomeIds: Readonly<Record<ForecastCycleSelection, string>>;
}>;

export type PersistedPredictionRef = Readonly<{ id: string }>;
export type PersistedForecastRef = Readonly<{ id: string }>;
export type PersistedDecisionRef = Readonly<{ id: string }>;

export type ForecastCycleDeps = Readonly<{
  clock: () => Date;
  loadEligibleFixtures: (
    window: Readonly<{
      from: Date;
      to: Date;
      /**
       * Restricts the scan to these internal event ids, when given. The
       * time window still applies -- it is the safety bound against an
       * unbounded scan, not something a caller with specific event ids gets
       * to skip -- so callers driving a demand-triggered recompute (a
       * lineup just landed) still pass a from/to wide enough to cover the
       * fixture's own kickoff, narrowed to exactly those fixtures rather
       * than to whatever else kicks off in the same window.
       */
      eventIds?: readonly string[];
    }>,
  ) => Promise<readonly ForecastCycleFixture[]>;
  /**
   * Provider identity -> internal competition -> model competition code.
   * Deliberately narrower than @velyq/domain's `CompetitionResolution`: the
   * orchestration below only ever branches on `ok` and reads
   * `modelCompetitionCode`, so this port does not force every adapter to
   * fabricate a `matchedBy`/`mismatch` pair that a resolution performed
   * once already, upstream, at ingestion time, has no further use for here.
   */
  resolveCompetition: (fixture: ForecastCycleFixture) => Promise<
    | Readonly<{ ok: true; modelCompetitionCode: string }>
    | Readonly<{
        ok: false;
        reason:
          | "UNRESOLVED_COMPETITION"
          | "AMBIGUOUS_PROVIDER_IDENTITY"
          | "MAPPING_PENDING_REVIEW"
          | "MAPPING_REJECTED";
      }>
  >;
  resolveHomeTeam: (fixture: ForecastCycleFixture) => Promise<TeamResolution>;
  resolveAwayTeam: (fixture: ForecastCycleFixture) => Promise<TeamResolution>;
  /**
   * Never reads a lineup observation received after `asOf`. A cycle run
   * against a historical `asOf` (a backtest, or a recompute triggered by
   * something other than "right now") must see the lineup exactly as it
   * stood at that moment -- reading whatever is newest at call time would
   * let a sheet confirmed after kickoff leak into a forecast that claims to
   * predate it.
   */
  getLineupState: (
    fixture: ForecastCycleFixture,
    asOf: Date,
  ) => Promise<"EXPECTED" | "OFFICIAL" | "MISSING" | "CHANGED">;
  assessQuality: (
    fixture: ForecastCycleFixture,
    selection: ForecastCycleSelection,
    asOf: Date,
  ) => Promise<
    Readonly<{ assessmentId: string; assessment: DataQualityAssessment }>
  >;
  getFreshestOdds: (
    eventMarketOutcomeId: string,
    asOf: Date,
  ) => Promise<Readonly<{ id: string; decimalOdds: string }> | null>;
  persistPrediction: (input: {
    run: {
      modelVersionId: string;
      calibrationVersionId: string;
      eventId: string;
      featureCutoff: Date;
      status: string;
      triggerJobId?: string | null;
    };
    prediction: {
      eventMarketOutcomeId: string;
      dataQualityAssessmentId: string;
      marketPriceObservationId?: string | null;
      decisionStatus: string;
      modelProbability?: string | null;
      fairOdds?: string | null;
      marketImpliedProbability?: string | null;
      edge?: string | null;
      expectedValue?: string | null;
      reasonCodes: readonly string[];
      structuredReasons: Record<string, unknown>;
    };
    inputs: readonly { sourceObservationId: string; inputRole: string }[];
  }) => Promise<PersistedPredictionRef>;
  persistForecast: (input: {
    predictionId: string;
    eventMarketOutcomeId: string;
    probability: string;
    modelVersion: string;
    featureCutoff: Date;
  }) => Promise<PersistedForecastRef>;
  persistDecision: (input: {
    forecastId: string;
    eventMarketOutcomeId: string;
    marketPriceObservationId?: string | null;
    status:
      | "STRONG_EDGE"
      | "NO_BET"
      | "WAIT"
      | "WAIT_FOR_LINEUP"
      | "INSUFFICIENT_DATA"
      | "EDGE_DISAPPEARED";
    selection: ForecastCycleSelection;
    offeredOdds?: string | null;
    fairOdds?: string | null;
    expectedValue?: string | null;
    whyNotCodes: readonly string[];
    decisionSnapshot: Record<string, unknown>;
  }) => Promise<PersistedDecisionRef>;
  modelArtifact: ModelArtifact;
  modelVersionId: string;
  calibrationVersionId: string;
  decisionPolicy?: DecisionPolicy;
  triggerJobId?: string;
}>;

export type ForecastCycleInput = Readonly<{
  from: Date;
  to: Date;
  /** See `ForecastCycleDeps.loadEligibleFixtures`. */
  eventIds?: readonly string[];
}>;

export type ForecastCycleResult = Readonly<{
  runId: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  fixturesScanned: number;
  identityResolved: number;
  modelEligible: number;
  predictionsCreated: number;
  forecastsCreated: number;
  decisionsCreated: number;
  strongEdgeCount: number;
  noBetCount: number;
  waitCount: number;
  waitForLineupCount: number;
  insufficientCount: number;
  skippedByReason: Readonly<Record<string, number>>;
  errorsByReason: Readonly<Record<string, number>>;
}>;

const MARKETS: readonly ForecastCycleMarket[] = [
  "FOOTBALL_FULL_TIME_1X2",
  "FOOTBALL_FULL_TIME_TOTAL",
];

/**
 * The only place probability arithmetic is trusted before it touches the
 * database. A model that occasionally emits NaN, a probability outside
 * [0,1], or a vector that doesn't sum to ~1 is a silent corruption source
 * the whole rest of the product would otherwise inherit -- fair odds,
 * edge, EV, and every customer-facing number downstream of them.
 *
 * Parameterised on length rather than fixed at 3: FT 1X2 is a three-way
 * market and FT Over/Under 2.5 is two-way, and the invariant -- every entry
 * a finite probability, the vector summing to 1 -- is the same one either
 * way.
 */
function validateProbabilityVector(
  probabilities: readonly number[],
  expectedLength: number,
): boolean {
  if (probabilities.length !== expectedLength) return false;
  if (probabilities.some((p) => !Number.isFinite(p) || p < 0 || p > 1))
    return false;
  const sum = probabilities.reduce((total, p) => total + p, 0);
  return Math.abs(sum - 1) <= 1e-6;
}

function increment(counts: Record<string, number>, reason: string): void {
  counts[reason] = (counts[reason] ?? 0) + 1;
}

/**
 * Model maturity is a promotion gate the decision engine's edge/EV
 * threshold does not know about: an EXPERIMENTAL artifact clearing the
 * default 3pp/EV>=0 policy is not evidence of anything beyond "the math
 * ran" -- there is no live forward-tested record behind it yet
 * (`decideMaturity` in @velyq/research never returns better than
 * EXPERIMENTAL for exactly this reason). STRONG_EDGE is downgraded to
 * NO_BET here, never inside `evaluateDecision`, so a caller that already
 * has a VALIDATED artifact is not silently blocked by a gate meant for
 * this one's maturity.
 */
function applyMaturityGate(
  status:
    | "STRONG_EDGE"
    | "NO_BET"
    | "WAIT"
    | "WAIT_FOR_LINEUP"
    | "INSUFFICIENT_DATA"
    | "EDGE_DISAPPEARED",
  whyNotCodes: readonly string[],
  maturity: ModelArtifact["maturity"],
): Readonly<{ status: typeof status; whyNotCodes: readonly string[] }> {
  if (
    status !== "STRONG_EDGE" ||
    maturity === "VALIDATED" ||
    maturity === "PRODUCTION"
  ) {
    return { status, whyNotCodes };
  }
  return {
    status: "NO_BET",
    whyNotCodes: [...whyNotCodes, "MODEL_MATURITY_INSUFFICIENT"],
  };
}

export async function runForecastCycle(
  deps: ForecastCycleDeps,
  input: ForecastCycleInput,
): Promise<ForecastCycleResult> {
  const startedAt = deps.clock();
  const runId = `forecast-cycle:${startedAt.toISOString()}`;

  const skippedByReason: Record<string, number> = {};
  const errorsByReason: Record<string, number> = {};
  let identityResolved = 0;
  let modelEligible = 0;
  let predictionsCreated = 0;
  let forecastsCreated = 0;
  let decisionsCreated = 0;
  let strongEdgeCount = 0;
  let noBetCount = 0;
  let waitCount = 0;
  let waitForLineupCount = 0;
  let insufficientCount = 0;

  const fixtures = await deps.loadEligibleFixtures(input);

  for (const fixture of fixtures) {
    try {
      const competition = await deps.resolveCompetition(fixture);
      if (!competition.ok) {
        increment(skippedByReason, competition.reason);
        continue;
      }
      const modelCompetitionCode = competition.modelCompetitionCode;

      const [home, away] = await Promise.all([
        deps.resolveHomeTeam(fixture),
        deps.resolveAwayTeam(fixture),
      ]);
      if (
        home.status === "TEAM_NOT_IN_MODEL" ||
        home.status === "UNRESOLVED_TEAM"
      ) {
        increment(skippedByReason, home.status);
        continue;
      }
      if (
        away.status === "TEAM_NOT_IN_MODEL" ||
        away.status === "UNRESOLVED_TEAM"
      ) {
        increment(skippedByReason, away.status);
        continue;
      }
      identityResolved += 1;

      const eligibility = resolveExpectedGoals(deps.modelArtifact.parameters, {
        competitionCode: modelCompetitionCode,
        homeTeamKey: home.teamKey,
        awayTeamKey: away.teamKey,
      });
      if (!eligibility.ok) {
        increment(skippedByReason, eligibility.reason);
        continue;
      }

      /*
       * Eligibility is resolved once per fixture, not once per market:
       * `resolveExpectedGoals` only asks whether the model has a rating for
       * this competition/team pair, which is a fact about the fixture, not
       * about which market is being priced.
       */
      modelEligible += 1;

      const asOf = deps.clock();
      const lineup = await deps.getLineupState(fixture, asOf);

      for (const market of MARKETS) {
        const selections = FORECAST_CYCLE_MARKETS[market];
        const probabilities = modelProbabilitiesFor(
          market,
          deps.modelArtifact.parameters,
          {
            competitionCode: modelCompetitionCode,
            homeTeamKey: home.teamKey,
            awayTeamKey: away.teamKey,
          },
        );
        if (
          !probabilities ||
          !validateProbabilityVector(probabilities, selections.length)
        ) {
          increment(skippedByReason, `MODEL_OUTPUT_INVALID_${market}`);
          continue;
        }

        for (const [index, selection] of selections.entries()) {
          const eventMarketOutcomeId = fixture.eventMarketOutcomeIds[selection];
          const modelProbability = probabilities[index]!;

          const [odds, quality] = await Promise.all([
            deps.getFreshestOdds(eventMarketOutcomeId, asOf),
            deps.assessQuality(fixture, selection, asOf),
          ]);

          const evaluation = evaluateDecision({
            modelProbability,
            currentOdds: odds ? Number(odds.decimalOdds) : null,
            quality: quality.assessment,
            lineup,
            policy: deps.decisionPolicy ?? DEFAULT_DECISION_POLICY,
          });
          const gated = applyMaturityGate(
            evaluation.status,
            evaluation.whyNotCodes,
            deps.modelArtifact.maturity,
          );

          const refusalStatus =
            gated.status === "INSUFFICIENT_DATA" ||
            gated.status === "WAIT_FOR_LINEUP";

          const prediction = await deps.persistPrediction({
            run: {
              modelVersionId: deps.modelVersionId,
              calibrationVersionId: deps.calibrationVersionId,
              eventId: fixture.eventId,
              featureCutoff: asOf,
              status: "COMPLETED",
              triggerJobId: deps.triggerJobId ?? null,
            },
            prediction: {
              eventMarketOutcomeId,
              dataQualityAssessmentId: quality.assessmentId,
              marketPriceObservationId: odds?.id ?? null,
              decisionStatus: gated.status,
              modelProbability: refusalStatus ? null : String(modelProbability),
              fairOdds: refusalStatus ? null : evaluation.fairOdds,
              marketImpliedProbability:
                refusalStatus || !odds
                  ? null
                  : String(1 / Number(odds.decimalOdds)),
              edge: refusalStatus
                ? null
                : evaluation.edge === null
                  ? null
                  : String(evaluation.edge),
              expectedValue: refusalStatus ? null : evaluation.expectedValue,
              reasonCodes: gated.whyNotCodes,
              structuredReasons: { whyNotCodes: gated.whyNotCodes },
            },
            inputs: [],
          });
          predictionsCreated += 1;

          const forecast = await deps.persistForecast({
            predictionId: prediction.id,
            eventMarketOutcomeId,
            probability: String(modelProbability),
            modelVersion: deps.modelArtifact.version,
            featureCutoff: asOf,
          });
          forecastsCreated += 1;

          await deps.persistDecision({
            forecastId: forecast.id,
            eventMarketOutcomeId,
            marketPriceObservationId: odds?.id ?? null,
            status: gated.status,
            selection,
            offeredOdds: odds?.decimalOdds ?? null,
            fairOdds: evaluation.fairOdds,
            expectedValue: evaluation.expectedValue,
            whyNotCodes: gated.whyNotCodes,
            decisionSnapshot: {
              modelProbability,
              modelVersion: deps.modelArtifact.version,
              modelMaturity: deps.modelArtifact.maturity,
              offeredOdds: odds?.decimalOdds ?? null,
              lineup,
            },
          });
          decisionsCreated += 1;

          switch (gated.status) {
            case "STRONG_EDGE":
              strongEdgeCount += 1;
              break;
            case "NO_BET":
              noBetCount += 1;
              break;
            case "WAIT":
              waitCount += 1;
              break;
            case "WAIT_FOR_LINEUP":
              waitForLineupCount += 1;
              break;
            case "INSUFFICIENT_DATA":
              insufficientCount += 1;
              break;
            default:
              break;
          }
        }
      }
    } catch (error) {
      increment(
        errorsByReason,
        error instanceof Error ? error.message : "UNKNOWN_ERROR",
      );
    }
  }

  const finishedAt = deps.clock();
  return {
    runId,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    fixturesScanned: fixtures.length,
    identityResolved,
    modelEligible,
    predictionsCreated,
    forecastsCreated,
    decisionsCreated,
    strongEdgeCount,
    noBetCount,
    waitCount,
    waitForLineupCount,
    insufficientCount,
    skippedByReason,
    errorsByReason,
  };
}
