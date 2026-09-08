import type { DataQualityAssessment } from "@velyq/analytics";
import {
  DEFAULT_DECISION_POLICY,
  evaluateDecision,
  type DecisionPolicy,
} from "@velyq/analytics/decision-engine";
import type { CompetitionResolution, TeamResolution } from "@velyq/domain";
import {
  modelProbabilitiesFor,
  resolveExpectedGoals,
  type ModelArtifact,
} from "@velyq/research";

/**
 * The one concrete gap this closes: nothing in the running application ever
 * called the model and wrote a `predictions` row. Every piece this wires
 * together (identity resolution, Dixon-Coles inference, the decision
 * engine, the append-only repositories) already existed and was already
 * tested in isolation -- this is the runtime path that actually calls them,
 * for FT 1X2, end to end.
 *
 * Deliberately port-based (every DB/model access comes in through `deps`)
 * so the orchestration logic -- numerical invariants, per-fixture failure
 * isolation, maturity gating, reason codes -- is unit-testable without a
 * database, while a thin adapter (not this file) wires the real
 * repositories for production and for the DB-backed E2E proof.
 */

export type ForecastCycleSelection = "HOME" | "DRAW" | "AWAY";

export type ForecastCycleFixture = Readonly<{
  eventId: string;
  /** The provider-facing competition code passed to identity resolution. */
  providerCompetitionCode: string;
  homeTeam: Readonly<{ sourceName: string; normalizedName: string }>;
  awayTeam: Readonly<{ sourceName: string; normalizedName: string }>;
  eventMarketOutcomeIds: Readonly<Record<ForecastCycleSelection, string>>;
}>;

export type PersistedPredictionRef = Readonly<{ id: string }>;
export type PersistedForecastRef = Readonly<{ id: string }>;
export type PersistedDecisionRef = Readonly<{ id: string }>;

export type ForecastCycleDeps = Readonly<{
  clock: () => Date;
  loadEligibleFixtures: (
    window: Readonly<{ from: Date; to: Date }>,
  ) => Promise<readonly ForecastCycleFixture[]>;
  /** Provider identity -> internal competition -> model competition code. */
  resolveCompetition: (
    fixture: ForecastCycleFixture,
  ) => Promise<
    CompetitionResolution & Readonly<{ modelCompetitionCode?: string }>
  >;
  resolveHomeTeam: (fixture: ForecastCycleFixture) => Promise<TeamResolution>;
  resolveAwayTeam: (fixture: ForecastCycleFixture) => Promise<TeamResolution>;
  getLineupState: (
    fixture: ForecastCycleFixture,
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

export type ForecastCycleInput = Readonly<{ from: Date; to: Date }>;

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

const SELECTIONS: readonly ForecastCycleSelection[] = ["HOME", "DRAW", "AWAY"];
const SELECTION_INDEX: Readonly<Record<ForecastCycleSelection, number>> = {
  HOME: 0,
  DRAW: 1,
  AWAY: 2,
};

/**
 * The only place probability arithmetic is trusted before it touches the
 * database. A model that occasionally emits NaN, a probability outside
 * [0,1], or a vector that doesn't sum to ~1 is a silent corruption source
 * the whole rest of the product would otherwise inherit -- fair odds,
 * edge, EV, and every customer-facing number downstream of them.
 */
function validateProbabilityVector(
  probabilities: readonly number[],
): probabilities is readonly [number, number, number] {
  if (probabilities.length !== 3) return false;
  if (probabilities.some((p) => !Number.isFinite(p) || p < 0 || p > 1))
    return false;
  const sum = probabilities[0]! + probabilities[1]! + probabilities[2]!;
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
      const modelCompetitionCode =
        competition.modelCompetitionCode ?? fixture.providerCompetitionCode;

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

      const probabilities = modelProbabilitiesFor(
        "FOOTBALL_FULL_TIME_1X2",
        deps.modelArtifact.parameters,
        {
          competitionCode: modelCompetitionCode,
          homeTeamKey: home.teamKey,
          awayTeamKey: away.teamKey,
        },
      );
      if (!probabilities || !validateProbabilityVector(probabilities)) {
        increment(skippedByReason, "MODEL_OUTPUT_INVALID");
        continue;
      }
      modelEligible += 1;

      const asOf = deps.clock();
      const lineup = await deps.getLineupState(fixture);

      for (const selection of SELECTIONS) {
        const eventMarketOutcomeId = fixture.eventMarketOutcomeIds[selection];
        const modelProbability = probabilities[SELECTION_INDEX[selection]]!;

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
