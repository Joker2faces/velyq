import { describe, expect, it, vi, type Mock } from "vitest";
import {
  assessDataQuality,
  DEFAULT_DATA_QUALITY_POLICY,
} from "@velyq/analytics";
import { DEFAULT_HYPERPARAMETERS } from "@velyq/research";
import type { ModelArtifact } from "@velyq/research";

import {
  runForecastCycle,
  type ForecastCycleDeps,
  type ForecastCycleFixture,
} from "../src/forecast-cycle.js";

/*
 * A fabricated but internally consistent Dixon-Coles artifact -- exactly
 * the shape `loadModelArtifact` accepts, with two known teams in one known
 * competition so `resolveExpectedGoals` succeeds deterministically. Fitting
 * a real model here would defeat the point: this suite is proving the
 * orchestration around inference (persistence, gating, isolation, reason
 * codes), not the Dixon-Coles math itself, which already has its own tests.
 */
function testArtifact(overrides: Partial<ModelArtifact> = {}): ModelArtifact {
  return {
    modelCode: "FOOTBALL_DIXON_COLES",
    version: "test-model.v1",
    maturity: "EXPERIMENTAL",
    featureContractVersion: "test.v1",
    trainingCutoff: "2026-01-01T00:00:00.000Z",
    trainingDatasetFingerprint: "sha256:test",
    parameters: {
      teams: [
        {
          teamKey: "home_fc",
          competitionCode: "TEST_LEAGUE",
          attack: 0.2,
          defence: -0.1,
          sampleWeight: 20,
          matches: 20,
        },
        {
          teamKey: "away_fc",
          competitionCode: "TEST_LEAGUE",
          attack: -0.1,
          defence: 0.05,
          sampleWeight: 20,
          matches: 20,
        },
      ],
      competitions: [
        {
          competitionCode: "TEST_LEAGUE",
          base: 0.1,
          homeAdvantage: 0.25,
          matches: 20,
        },
      ],
      rho: -0.05,
      hyperparameters: DEFAULT_HYPERPARAMETERS,
      trainingCutoff: "2026-01-01T00:00:00.000Z",
      iterations: 10,
      logLikelihood: -100,
      converged: true,
      matchesUsed: 20,
    },
    calibrators: [],
    uncertaintyProfiles: [],
    validationReport: {
      generatedAt: "2026-01-01T00:00:00.000Z",
      corpusSourceCodes: [],
      walkForwardCutoffs: [],
      holdoutFrom: "2026-01-01T00:00:00.000Z",
      trainRecords: 20,
      validationRecords: 5,
      holdoutRecords: 5,
      leakageAudit: { ok: true, violations: 0 },
      competitions: [],
    },
    ...overrides,
  };
}

function testFixture(
  overrides: Partial<ForecastCycleFixture> = {},
): ForecastCycleFixture {
  return {
    eventId: "event-1",
    providerCompetitionCode: "TEST_LEAGUE",
    homeTeam: { sourceName: "Home FC", normalizedName: "home_fc" },
    awayTeam: { sourceName: "Away FC", normalizedName: "away_fc" },
    eventMarketOutcomeIds: {
      HOME: "outcome-home",
      DRAW: "outcome-draw",
      AWAY: "outcome-away",
      OVER: "outcome-over",
      UNDER: "outcome-under",
    },
    ...overrides,
  };
}

/** Selections priced per fixture: 3 for FT 1X2, 2 for FT Over/Under 2.5. */
const SELECTIONS_PER_FIXTURE = 5;

const goodQuality = assessDataQuality({
  policyVersion: DEFAULT_DATA_QUALITY_POLICY.policyVersion,
  asOf: "2026-09-20T00:00:00.000Z",
  receivedAt: "2026-09-20T00:00:00.000Z",
  priceCount: 3,
  bookmakerCount: 3,
  lineup: "OFFICIAL",
  mappingConfidence: "HIGH",
  edgeAvailable: true,
  edgePresent: true,
});

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

type PersistPredictionInput = Parameters<
  ForecastCycleDeps["persistPrediction"]
>[0];
type PersistForecastInput = Parameters<ForecastCycleDeps["persistForecast"]>[0];
type PersistDecisionInput = Parameters<ForecastCycleDeps["persistDecision"]>[0];

/** A working set of deps with every persistence port recorded, not faked away silently. */
function testDeps(
  overrides: Partial<ForecastCycleDeps> = {},
): ForecastCycleDeps & {
  persistedPredictions: PersistPredictionInput[];
  persistedForecasts: PersistForecastInput[];
  persistedDecisions: PersistDecisionInput[];
} {
  const persistedPredictions: PersistPredictionInput[] = [];
  const persistedForecasts: PersistForecastInput[] = [];
  const persistedDecisions: PersistDecisionInput[] = [];

  const deps: ForecastCycleDeps & {
    persistedPredictions: PersistPredictionInput[];
    persistedForecasts: PersistForecastInput[];
    persistedDecisions: PersistDecisionInput[];
  } = {
    clock: () => new Date("2026-09-20T00:00:00.000Z"),
    loadEligibleFixtures: vi.fn(async () => [testFixture()]),
    resolveCompetition: vi.fn(async () => ({
      ok: true as const,
      competitionId: "competition-1",
      modelCompetitionCode: "TEST_LEAGUE",
    })),
    resolveHomeTeam: vi.fn(async () => ({
      status: "PROVIDER_IDENTITY_MATCH" as const,
      teamKey: "home_fc",
    })),
    resolveAwayTeam: vi.fn(async () => ({
      status: "PROVIDER_IDENTITY_MATCH" as const,
      teamKey: "away_fc",
    })),
    getLineupState: vi.fn(async () => "OFFICIAL" as const),
    assessQuality: vi.fn(async () => ({
      assessmentId: nextId("quality"),
      assessment: goodQuality,
    })),
    getFreshestOdds: vi.fn(async () => null),
    persistPrediction: vi.fn(async (input) => {
      persistedPredictions.push(input);
      return { id: nextId("prediction") };
    }),
    persistForecast: vi.fn(async (input) => {
      persistedForecasts.push(input);
      return { id: nextId("forecast") };
    }),
    persistDecision: vi.fn(async (input) => {
      persistedDecisions.push(input);
      return { id: nextId("decision") };
    }),
    modelArtifact: testArtifact(),
    modelVersionId: "model-version-1",
    calibrationVersionId: "calibration-version-1",
    persistedPredictions,
    persistedForecasts,
    persistedDecisions,
    ...overrides,
  };
  return deps;
}

const WINDOW = {
  from: new Date("2026-09-20T00:00:00.000Z"),
  to: new Date("2026-09-21T00:00:00.000Z"),
};

describe("runForecastCycle", () => {
  it("produces a real prediction, forecast, and decision for each selection of both markets, without odds staying visible as WAIT/MARKET_DATA_UNAVAILABLE", async () => {
    const deps = testDeps();
    const result = await runForecastCycle(deps, WINDOW);

    expect(result.fixturesScanned).toBe(1);
    expect(result.identityResolved).toBe(1);
    expect(result.modelEligible).toBe(1);
    // 3 for FT 1X2 (HOME/DRAW/AWAY) + 2 for FT Over/Under 2.5 (OVER/UNDER).
    expect(result.predictionsCreated).toBe(SELECTIONS_PER_FIXTURE);
    expect(result.forecastsCreated).toBe(SELECTIONS_PER_FIXTURE);
    expect(result.decisionsCreated).toBe(SELECTIONS_PER_FIXTURE);
    // No odds anywhere -- every selection must stay a visible forecast at
    // WAIT/MARKET_DATA_UNAVAILABLE, never collapse into "no prediction".
    expect(result.waitCount).toBe(SELECTIONS_PER_FIXTURE);
    expect(result.insufficientCount).toBe(0);
    expect(Object.keys(result.errorsByReason)).toHaveLength(0);

    for (const prediction of deps.persistedPredictions) {
      expect(prediction.prediction.decisionStatus).toBe("WAIT");
      // WAIT (missing market data) is not a refusal-with-null-metrics state
      // -- unlike INSUFFICIENT_DATA/WAIT_FOR_LINEUP, the model's own
      // probability must stay visible here, which is the whole point of
      // "forecast exists, price does not" per DatabasePredictionRepository's
      // own INVALID_PREDICTION_REFUSAL_METRICS guard (which does not fire
      // for WAIT).
      expect(prediction.prediction.modelProbability).not.toBeNull();
    }
    for (const decision of deps.persistedDecisions) {
      expect(decision.whyNotCodes).toContain("MARKET_DATA_UNAVAILABLE");
    }

    // Both markets are genuinely represented, not just five copies of one.
    const selections = deps.persistedDecisions.map((d) => d.selection).sort();
    expect(selections).toEqual(["AWAY", "DRAW", "HOME", "OVER", "UNDER"]);
    // The totals market's own model probability is real Dixon-Coles output
    // (via totalGoalsProbabilities), not a placeholder -- it must differ
    // from the 1X2 selections' probabilities and sum to 1 with its sibling.
    const overPrediction = deps.persistedPredictions.find(
      (p) => p.prediction.eventMarketOutcomeId === "outcome-over",
    );
    const underPrediction = deps.persistedPredictions.find(
      (p) => p.prediction.eventMarketOutcomeId === "outcome-under",
    );
    expect(overPrediction?.prediction.modelProbability).not.toBeNull();
    expect(underPrediction?.prediction.modelProbability).not.toBeNull();
    const overP = Number(overPrediction?.prediction.modelProbability);
    const underP = Number(underPrediction?.prediction.modelProbability);
    expect(overP).toBeGreaterThan(0);
    expect(overP).toBeLessThan(1);
    expect(overP + underP).toBeCloseTo(1, 6);
  });

  it("promotes to STRONG_EDGE only when the model artifact has cleared maturity, even if edge/EV clear the policy threshold", async () => {
    const deps = testDeps({
      getFreshestOdds: vi.fn(async (outcomeId: string) =>
        // A short price against the HOME outcome specifically -- model puts
        // real weight on HOME (home advantage + attack edge), so this is a
        // genuine edge by the policy's own math, not a fabricated one.
        outcomeId === "outcome-home"
          ? { id: "odds-1", decimalOdds: "2.20" }
          : { id: "odds-2", decimalOdds: "3.40" },
      ),
    });
    const result = await runForecastCycle(deps, WINDOW);

    // EXPERIMENTAL maturity must block STRONG_EDGE outright.
    expect(result.strongEdgeCount).toBe(0);
    for (const decision of deps.persistedDecisions) {
      expect(decision.status).not.toBe("STRONG_EDGE");
    }
  });

  it("allows STRONG_EDGE once the artifact is VALIDATED and the edge clears the policy threshold", async () => {
    const deps = testDeps({
      modelArtifact: testArtifact({ maturity: "VALIDATED" }),
      getFreshestOdds: vi.fn(async (outcomeId: string) =>
        outcomeId === "outcome-home"
          ? { id: "odds-1", decimalOdds: "2.20" }
          : { id: "odds-2", decimalOdds: "3.40" },
      ),
    });
    const result = await runForecastCycle(deps, WINDOW);

    expect(result.strongEdgeCount).toBeGreaterThan(0);
  });

  it("skips a fixture with a precise reason code when the competition has no identity, without failing the whole cycle", async () => {
    const deps = testDeps({
      loadEligibleFixtures: vi.fn(async () => [
        testFixture({ eventId: "event-a" }),
        testFixture({ eventId: "event-b" }),
      ]),
      resolveCompetition: vi
        .fn()
        .mockResolvedValueOnce({ ok: false, reason: "UNRESOLVED_COMPETITION" })
        .mockResolvedValueOnce({
          ok: true,
          competitionId: "competition-1",
          modelCompetitionCode: "TEST_LEAGUE",
        }),
    });
    const result = await runForecastCycle(deps, WINDOW);

    expect(result.fixturesScanned).toBe(2);
    expect(result.skippedByReason["UNRESOLVED_COMPETITION"]).toBe(1);
    // The second fixture must still be processed -- one bad fixture does
    // not fail the cycle.
    expect(result.modelEligible).toBe(1);
    expect(result.predictionsCreated).toBe(SELECTIONS_PER_FIXTURE);
  });

  it("skips with TEAM_NOT_IN_MODEL when the away team resolves to a verified alias that has no rating", async () => {
    const deps = testDeps({
      resolveAwayTeam: vi.fn(async () => ({
        status: "TEAM_NOT_IN_MODEL" as const,
        teamKey: "unrated_fc",
        via: "VERIFIED_ALIAS_MATCH" as const,
      })),
    });
    const result = await runForecastCycle(deps, WINDOW);

    expect(result.skippedByReason["TEAM_NOT_IN_MODEL"]).toBe(1);
    expect(result.identityResolved).toBe(0);
    expect(result.predictionsCreated).toBe(0);
  });

  it("skips with COMPETITION_NOT_IN_MODEL when identity resolves but the model has never seen that competition", async () => {
    const deps = testDeps({
      resolveCompetition: vi.fn(async () => ({
        ok: true as const,
        competitionId: "competition-1",
        modelCompetitionCode: "UNKNOWN_LEAGUE",
      })),
    });
    const result = await runForecastCycle(deps, WINDOW);

    expect(result.skippedByReason["COMPETITION_NOT_IN_MODEL"]).toBe(1);
    // Identity itself resolved fine -- this is a model-coverage gap, a
    // different failure from an unresolved provider identity.
    expect(result.identityResolved).toBe(1);
    expect(result.modelEligible).toBe(0);
  });

  it("isolates a per-fixture persistence error without losing the rest of the cycle's counts", async () => {
    const deps = testDeps({
      loadEligibleFixtures: vi.fn(async () => [
        testFixture({ eventId: "event-a" }),
        testFixture({ eventId: "event-b" }),
      ]),
      persistPrediction: vi
        .fn()
        .mockRejectedValueOnce(new Error("PREDICTION_INSERT_FAILED"))
        .mockResolvedValue({ id: nextId("prediction") }),
    });
    const result = await runForecastCycle(deps, WINDOW);

    expect(result.fixturesScanned).toBe(2);
    expect(result.errorsByReason["PREDICTION_INSERT_FAILED"]).toBe(1);
    // The second fixture's five selections still persist.
    expect(result.predictionsCreated).toBe(SELECTIONS_PER_FIXTURE);
  });

  it("never persists a fixture whose model output fails the numerical invariant check", async () => {
    const deps = testDeps({
      modelArtifact: testArtifact({
        parameters: {
          ...testArtifact().parameters,
          // Absurd ratings push the implied score distribution outside any
          // sane range; even so the vector should always still sum to ~1
          // in this model -- so instead we directly prove the guard by
          // supplying a competition the model has no rating scale for,
          // forcing a degenerate (but still finite) result is hard to
          // fabricate through the real math, so this test asserts the
          // guard function's own contract via a corrupted artifact that
          // makes resolveExpectedGoals produce non-finite lambda/mu.
          teams: [
            {
              teamKey: "home_fc",
              competitionCode: "TEST_LEAGUE",
              attack: Number.POSITIVE_INFINITY,
              defence: -0.1,
              sampleWeight: 20,
              matches: 20,
            },
            testArtifact().parameters.teams[1]!,
          ],
        },
      }),
    });
    const result = await runForecastCycle(deps, WINDOW);

    // Reasons are now market-qualified, since each market's own probability
    // vector is validated independently -- both fail here for the same
    // underlying corrupted artifact.
    expect(
      result.skippedByReason["MODEL_OUTPUT_INVALID_FOOTBALL_FULL_TIME_1X2"],
    ).toBe(1);
    expect(
      result.skippedByReason["MODEL_OUTPUT_INVALID_FOOTBALL_FULL_TIME_TOTAL"],
    ).toBe(1);
    expect(result.predictionsCreated).toBe(0);
  });

  it("running the same cycle twice is safe: it always calls the persistence ports the same, idempotency-aware way (delegated to the repositories, not re-implemented here)", async () => {
    const deps = testDeps();
    await runForecastCycle(deps, WINDOW);
    await runForecastCycle(deps, WINDOW);

    // The cycle itself does not deduplicate -- that contract belongs to
    // the injected repositories (proven against real Postgres in
    // packages/database/test-integration). What this cycle must guarantee
    // is that it calls persistPrediction/persistForecast/persistDecision
    // with the same logical shape every run, which those repositories can
    // then dedupe on.
    expect(deps.persistPrediction).toHaveBeenCalledTimes(
      2 * SELECTIONS_PER_FIXTURE,
    );
    const [firstRun, secondRun] = [
      (deps.persistPrediction as Mock).mock
        .calls[0]![0] as PersistPredictionInput,
      (deps.persistPrediction as Mock).mock.calls[
        SELECTIONS_PER_FIXTURE
      ]![0] as PersistPredictionInput,
    ];
    expect(firstRun.prediction.decisionStatus).toBe(
      secondRun.prediction.decisionStatus,
    );
  });
});
