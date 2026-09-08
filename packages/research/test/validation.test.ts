import { describe, expect, it } from "vitest";
import {
  applyTemperature,
  artifactFingerprint,
  auditWalkForward,
  bandFor,
  brierScore,
  buildUncertaintyProfile,
  decideMaturity,
  empiricalFrequencies,
  expectedCalibrationError,
  fitTemperature,
  IDENTITY_CALIBRATOR,
  logLoss,
  MINIMUM_PROFILE_SAMPLES,
  planWalkForward,
  reliabilityBins,
  trainingDatasetFingerprint,
  type ModelArtifact,
  type ProbabilisticSample,
  type ValidationReport,
} from "../src/index.js";

function dated(count: number, start = Date.UTC(2020, 0, 1)) {
  return Array.from({ length: count }, (_, index) => ({
    kickoffDate: new Date(start + index * 86_400_000)
      .toISOString()
      .slice(0, 10),
  }));
}

describe("walk-forward planning", () => {
  const records = dated(1000);
  const plan = planWalkForward(records, {
    initialTrainingDays: 200,
    stepDays: 50,
    holdoutFraction: 0.2,
  });

  it("takes the holdout from the end of the timeline, never sampled", () => {
    // The most recent stretch is the closest thing available to "what happens
    // next", which is the only question that matters.
    expect(plan.holdoutRecords).toBeGreaterThan(0);
    const boundary = records[Math.floor(records.length * 0.8)]?.kickoffDate;
    expect(plan.holdoutFrom).toBe(boundary);
  });

  it("advances the cutoff monotonically and never into the holdout", () => {
    expect(plan.windows.length).toBeGreaterThan(1);
    plan.windows.forEach((window, index) => {
      const previous = plan.windows[index - 1];
      if (previous)
        expect(window.trainingCutoff > previous.trainingCutoff).toBe(true);
      expect(window.predictUntil <= plan.holdoutFrom).toBe(true);
      expect(window.predictFrom).toBe(window.trainingCutoff);
    });
  });

  it("returns an empty plan for an empty corpus rather than throwing", () => {
    const empty = planWalkForward([], {
      initialTrainingDays: 200,
      stepDays: 50,
      holdoutFraction: 0.2,
    });
    expect(empty.windows).toEqual([]);
    expect(empty.holdoutRecords).toBe(0);
  });
});

describe("the leakage audit", () => {
  const records = dated(500);
  const plan = planWalkForward(records, {
    initialTrainingDays: 100,
    stepDays: 50,
    holdoutFraction: 0.2,
  });
  const window = plan.windows[0]!;

  it("passes a correctly split window", () => {
    const report = auditWalkForward(plan, [
      {
        windowIndex: window.index,
        training: records.filter(
          (record) => record.kickoffDate < window.trainingCutoff,
        ),
        predicted: records.filter(
          (record) =>
            record.kickoffDate >= window.predictFrom &&
            record.kickoffDate < window.predictUntil,
        ),
      },
    ]);
    expect(report).toEqual({ ok: true, violations: [] });
  });

  it("catches a training set that includes the cutoff date itself", () => {
    // The `<=` where a `<` was needed. Bounds that look right and a filter
    // that is off by one produce a leak no amount of reading the window
    // definition would reveal, which is why the audit checks the rows.
    const report = auditWalkForward(plan, [
      {
        windowIndex: window.index,
        training: records.filter(
          (record) => record.kickoffDate <= window.trainingCutoff,
        ),
        predicted: [],
      },
    ]);
    expect(report.ok).toBe(false);
    expect(report.violations[0]?.kind).toBe("TRAINING_ON_OR_AFTER_CUTOFF");
  });

  it("catches a prediction set that reaches back before the cutoff", () => {
    const report = auditWalkForward(plan, [
      { windowIndex: window.index, training: [], predicted: records },
    ]);
    expect(report.ok).toBe(false);
    expect(report.violations[0]?.kind).toBe("PREDICTION_BEFORE_CUTOFF");
  });
});

describe("scoring rules", () => {
  const certain: ProbabilisticSample[] = [
    { probabilities: [1, 0, 0], observedIndex: 0 },
  ];
  const uniform: ProbabilisticSample[] = [
    { probabilities: [1 / 3, 1 / 3, 1 / 3], observedIndex: 0 },
  ];

  it("scores a perfect forecast at zero and a uniform one worse", () => {
    expect(brierScore(certain)).toBeCloseTo(0, 12);
    expect(logLoss(certain)).toBeCloseTo(0, 12);
    expect(brierScore(uniform)).toBeGreaterThan(brierScore(certain));
    expect(logLoss(uniform)).toBeCloseTo(Math.log(3), 10);
  });

  it("clamps a confident miss instead of returning infinity", () => {
    // One confident miss would otherwise destroy any comparison between
    // models, which is worse than reporting a large finite penalty.
    const miss = logLoss([{ probabilities: [1, 0, 0], observedIndex: 1 }]);
    expect(Number.isFinite(miss)).toBe(true);
    expect(miss).toBeGreaterThan(20);
  });

  it("reports NaN for an empty sample rather than a flattering zero", () => {
    expect(brierScore([])).toBeNaN();
    expect(logLoss([])).toBeNaN();
  });

  it("measures the base rates a model has to beat", () => {
    const samples: ProbabilisticSample[] = [
      { probabilities: [], observedIndex: 0 },
      { probabilities: [], observedIndex: 0 },
      { probabilities: [], observedIndex: 1 },
      { probabilities: [], observedIndex: 2 },
    ];
    expect(empiricalFrequencies(samples, 3)).toEqual([0.5, 0.25, 0.25]);
  });

  it("reports near-zero calibration error for a perfectly calibrated forecast", () => {
    // Ten of these at p=0.5 with five hits: well calibrated, and useless.
    // That is exactly why calibration error is only meaningful next to Brier.
    const samples: ProbabilisticSample[] = Array.from(
      { length: 100 },
      (_, index) => ({
        probabilities: [0.5, 0.5],
        observedIndex: index % 2,
      }),
    );
    expect(expectedCalibrationError(samples, 2)).toBeCloseTo(0, 6);
    expect(brierScore(samples)).toBeCloseTo(0.5, 6);
  });

  it("buckets reliability by predicted probability", () => {
    const bins = reliabilityBins(
      [
        { probabilities: [0.05, 0.95], observedIndex: 1 },
        { probabilities: [0.95, 0.05], observedIndex: 0 },
      ],
      0,
      10,
    );
    expect(bins[0]?.count).toBe(1);
    expect(bins[9]?.count).toBe(1);
    expect(bins[9]?.observedFrequency).toBe(1);
    expect(bins[5]?.count).toBe(0);
    expect(bins[5]?.meanPredicted).toBeNaN();
  });
});

describe("calibration", () => {
  /* Deliberately overconfident: predicts 0.9 but is right only 70% of the time. */
  const overconfident: ProbabilisticSample[] = Array.from(
    { length: 1000 },
    (_, index) => ({
      probabilities: [0.9, 0.1],
      observedIndex: index % 10 < 7 ? 0 : 1,
    }),
  );

  it("softens an overconfident forecast and reports the improvement", () => {
    const calibrator = fitTemperature(overconfident);
    expect(calibrator.temperature).toBeGreaterThan(1);
    expect(calibrator.logLossAfter).toBeLessThan(calibrator.logLossBefore);
    expect(calibrator.fittedOn).toBe(1000);
  });

  it("leaves a well-calibrated forecast alone at exactly one", () => {
    // "Calibration did not help" must be representable as the identity, not
    // as a marginally different number that implies it did.
    const calibrated: ProbabilisticSample[] = Array.from(
      { length: 1000 },
      (_, index) => ({
        probabilities: [0.7, 0.3],
        observedIndex: index % 10 < 7 ? 0 : 1,
      }),
    );
    expect(fitTemperature(calibrated).temperature).toBe(1);
  });

  it("returns the identity for an empty fitting set", () => {
    expect(fitTemperature([])).toEqual(IDENTITY_CALIBRATOR);
  });

  it("preserves the probability sum and the outcome ordering", () => {
    // Temperature scaling cannot reorder outcomes, so it cannot manufacture
    // an edge the model did not already see.
    const scaled = applyTemperature([0.6, 0.3, 0.1], 1.8);
    expect(scaled.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 12);
    expect(scaled[0]!).toBeGreaterThan(scaled[1]!);
    expect(scaled[1]!).toBeGreaterThan(scaled[2]!);
  });

  it("is the identity at a temperature of one", () => {
    expect(applyTemperature([0.6, 0.4], 1)).toEqual([0.6, 0.4]);
  });

  it("ignores a nonsensical temperature rather than emitting NaN", () => {
    expect(applyTemperature([0.6, 0.4], 0)).toEqual([0.6, 0.4]);
    expect(applyTemperature([0.6, 0.4], -1)).toEqual([0.6, 0.4]);
  });
});

describe("uncertainty", () => {
  const samples = (count: number, hitRate: number): ProbabilisticSample[] =>
    Array.from({ length: count }, (_, index) => ({
      probabilities: [0.65, 0.35],
      observedIndex: index % 100 < hitRate * 100 ? 0 : 1,
    }));

  it("refuses to build a profile from too few samples", () => {
    // A band estimated from thirty matches is noise dressed as evidence, and
    // it would be handed straight to a robust-EV gate as if it were measured.
    expect(
      buildUncertaintyProfile({
        competitionCode: "TEST",
        marketCode: "FOOTBALL_FULL_TIME_1X2",
        outcomeCount: 2,
        validationSamples: samples(MINIMUM_PROFILE_SAMPLES - 1, 0.6),
      }),
    ).toBeNull();
  });

  it("builds a band that reflects the measured optimism", () => {
    const profile = buildUncertaintyProfile({
      competitionCode: "TEST",
      marketCode: "FOOTBALL_FULL_TIME_1X2",
      outcomeCount: 2,
      validationSamples: samples(1000, 0.55),
    });
    expect(profile).not.toBeNull();
    const band = bandFor(profile, 0, 0.65);
    expect(band).not.toBeNull();
    if (!band) return;
    // Predicted 0.65, happened 0.55: the conservative probability must sit
    // below the forecast by at least that measured ten-point gap.
    expect(band.lowerBound).toBeLessThan(0.65 - 0.09);
    expect(band.upperBound).toBeGreaterThan(0.65);
    expect(band.method).toBe("BOOTSTRAP");
  });

  it("returns no band at all when the profile is missing", () => {
    // Null is a first-class answer. A caller must read it as "no robust
    // decision is possible", never as zero uncertainty.
    expect(bandFor(null, 0, 0.5)).toBeNull();
  });

  it("returns no band for a probability level the validation set never reached", () => {
    const profile = buildUncertaintyProfile({
      competitionCode: "TEST",
      marketCode: "FOOTBALL_FULL_TIME_1X2",
      outcomeCount: 2,
      validationSamples: samples(1000, 0.55),
    });
    // Nothing in the fitting set predicted 5%, so there is no evidence about
    // how the model behaves there.
    expect(bandFor(profile, 0, 0.05)).toBeNull();
  });

  it("keeps the band inside [0, 1]", () => {
    const profile = buildUncertaintyProfile({
      competitionCode: "TEST",
      marketCode: "FOOTBALL_FULL_TIME_1X2",
      outcomeCount: 2,
      validationSamples: Array.from({ length: 1000 }, (_, index) => ({
        probabilities: [0.98, 0.02],
        observedIndex: index % 100 < 30 ? 0 : 1,
      })),
    });
    const band = bandFor(profile, 0, 0.98);
    if (band) {
      expect(band.lowerBound).toBeGreaterThanOrEqual(0);
      expect(band.upperBound).toBeLessThanOrEqual(1);
    }
  });
});

describe("model artifacts", () => {
  const rows = [
    {
      competitionCode: "TEST",
      homeTeamKey: "a",
      awayTeamKey: "b",
      homeGoals: 1,
      awayGoals: 0,
      kickoffDate: "2024-01-01",
    },
    {
      competitionCode: "TEST",
      homeTeamKey: "b",
      awayTeamKey: "a",
      homeGoals: 2,
      awayGoals: 2,
      kickoffDate: "2024-02-01",
    },
  ];

  it("fingerprints the training rows, not the order they arrived in", () => {
    // Two artifacts trained on the same matches assembled from differently
    // named files must fingerprint identically.
    expect(trainingDatasetFingerprint(rows)).toBe(
      trainingDatasetFingerprint([...rows].reverse()),
    );
  });

  it("changes the fingerprint when a single match changes", () => {
    const [first, second] = rows;
    expect(
      trainingDatasetFingerprint([first!, { ...second!, homeGoals: 3 }]),
    ).not.toBe(trainingDatasetFingerprint(rows));
    expect(trainingDatasetFingerprint([first!])).not.toBe(
      trainingDatasetFingerprint(rows),
    );
  });

  function report(overrides: Partial<ValidationReport> = {}): ValidationReport {
    return {
      generatedAt: "2026-09-07T00:00:00.000Z",
      corpusSourceCodes: ["FOOTBALL_DATA_UK"],
      walkForwardCutoffs: ["2024-01-01"],
      holdoutFrom: "2025-01-01",
      trainRecords: 10_000,
      validationRecords: 20_000,
      holdoutRecords: 6000,
      leakageAudit: { ok: true, violations: 0 },
      competitions: [
        {
          competitionCode: "TEST",
          matchesInCorpus: 1000,
          markets: [
            {
              marketCode: "FOOTBALL_FULL_TIME_1X2",
              outcomeCount: 3,
              trainSampleCount: 900,
              validation: {
                sampleCount: 500,
                brier: 0.6,
                logLoss: 1,
                calibrationError: 0.03,
              },
              holdout: {
                sampleCount: 500,
                brier: 0.6,
                logLoss: 1,
                calibrationError: 0.03,
              },
              baselines: [
                {
                  code: "EMPIRICAL_FREQUENCY",
                  validation: {
                    sampleCount: 500,
                    brier: 0.65,
                    logLoss: 1.06,
                    calibrationError: 0.05,
                  },
                  holdout: {
                    sampleCount: 500,
                    brier: 0.65,
                    logLoss: 1.06,
                    calibrationError: 0.05,
                  },
                  modelBeatsOnHoldout: true,
                },
              ],
            },
          ],
        },
      ],
      ...overrides,
    };
  }

  it("stays EXPERIMENTAL even when every baseline is beaten on holdout", () => {
    // Attractive backtest numbers on one sample are not a promotion. The step
    // above EXPERIMENTAL needs a live forward-tested record, which cannot
    // exist on the day a model is first fitted.
    const decision = decideMaturity(report());
    expect(decision.maturity).toBe("EXPERIMENTAL");
    expect(decision.reasonCodes).toContain("NO_LIVE_FORWARD_TEST_RECORD");
    expect(decision.reasonCodes).not.toContain(
      "BASELINE_NOT_BEATEN_ON_HOLDOUT",
    );
  });

  it("names a lost baseline as its own blocker", () => {
    const losing = report();
    const market = losing.competitions[0]!.markets[0]!;
    const decision = decideMaturity({
      ...losing,
      competitions: [
        {
          ...losing.competitions[0]!,
          markets: [
            {
              ...market,
              baselines: [
                { ...market.baselines[0]!, modelBeatsOnHoldout: false },
              ],
            },
          ],
        },
      ],
    });
    expect(decision.reasonCodes).toContain("BASELINE_NOT_BEATEN_ON_HOLDOUT");
  });

  it("treats an unavailable baseline as neither beaten nor lost to", () => {
    // Football-Data publishes no both-teams-to-score prices at all, so that
    // market legitimately has no market baseline. An absent comparison must
    // not read as a failed one.
    const absent = report();
    const market = absent.competitions[0]!.markets[0]!;
    const decision = decideMaturity({
      ...absent,
      competitions: [
        {
          ...absent.competitions[0]!,
          markets: [
            {
              ...market,
              baselines: [
                {
                  ...market.baselines[0]!,
                  holdout: null,
                  modelBeatsOnHoldout: null,
                },
              ],
            },
          ],
        },
      ],
    });
    expect(decision.reasonCodes).not.toContain(
      "BASELINE_NOT_BEATEN_ON_HOLDOUT",
    );
  });

  it("reports leakage as the only blocker that matters when it happens", () => {
    const decision = decideMaturity(
      report({ leakageAudit: { ok: false, violations: 3 } }),
    );
    expect(decision.reasonCodes).toEqual(["WALK_FORWARD_LEAKAGE_DETECTED"]);
  });

  it("flags a holdout too small to conclude anything from", () => {
    expect(
      decideMaturity(report({ holdoutRecords: 10 })).reasonCodes,
    ).toContain("HOLDOUT_SAMPLE_TOO_SMALL");
  });

  it("fingerprints an artifact independently of key order", () => {
    const base: ModelArtifact = {
      modelCode: "FOOTBALL_DIXON_COLES",
      version: "test.v1",
      maturity: "EXPERIMENTAL",
      featureContractVersion: "features.v1",
      trainingCutoff: "2025-01-01",
      trainingDatasetFingerprint: trainingDatasetFingerprint(rows),
      parameters: {
        teams: [],
        competitions: [],
        rho: -0.05,
        hyperparameters: {
          timeDecayPerDay: 0.002,
          ratingPenalty: 0.02,
          maxIterations: 10,
          learningRate: 0.05,
          tolerance: 1e-10,
        },
        trainingCutoff: "2025-01-01",
        iterations: 10,
        logLikelihood: -1,
        converged: true,
        matchesUsed: 2,
      },
      calibrators: [],
      uncertaintyProfiles: [],
      validationReport: report(),
    };
    const reordered = {
      validationReport: base.validationReport,
      version: base.version,
      ...base,
    } as ModelArtifact;
    expect(artifactFingerprint(reordered)).toBe(artifactFingerprint(base));
    expect(artifactFingerprint({ ...base, maturity: "VALIDATED" })).not.toBe(
      artifactFingerprint(base),
    );
  });
});
