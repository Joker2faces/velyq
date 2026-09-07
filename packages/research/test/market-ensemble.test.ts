import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertTrainableFeatures,
  bucketDisagreement,
  decideEnsembleVerdict,
  ensemblePredict,
  featureClassOf,
  FEATURE_REGISTRY,
  fitMarketEnsemble,
  marketOnlyEnsemble,
  modelContribution,
  studyClosingLine,
  type DisagreementRecord,
  type StackingSample,
} from "../src/index.js";

/**
 * Samples where the market is right and the model is noise.
 *
 * `outcomeRate` is the truth; the market states it and the model states
 * something unrelated. A stacker that has learned anything real must put its
 * weight on the market here.
 */
function marketIsRight(count: number, outcomeRate = 0.5): StackingSample[] {
  return Array.from({ length: count }, (_, index) => ({
    market: [outcomeRate, 1 - outcomeRate],
    /* Alternating nonsense, uncorrelated with the outcome. */
    model: index % 2 === 0 ? [0.9, 0.1] : [0.1, 0.9],
    observedIndex: index % 100 < outcomeRate * 100 ? 0 : 1,
  }));
}

/** Samples where the model is right and the market is uninformative. */
function modelIsRight(count: number): StackingSample[] {
  return Array.from({ length: count }, (_, index) => {
    const strong = index % 2 === 0;
    return {
      market: [0.5, 0.5],
      model: strong ? [0.8, 0.2] : [0.2, 0.8],
      /* The model's confident side happens 80% of the time. */
      observedIndex: strong ? (index % 10 < 8 ? 0 : 1) : index % 10 < 8 ? 1 : 0,
    };
  });
}

describe("the market-only default", () => {
  it("reproduces the market's own probabilities exactly", () => {
    // "No ensemble" and "an ensemble that decided to trust the market" have to
    // be the same object, or the two become separate code paths that drift.
    const ensemble = marketOnlyEnsemble(3);
    expect(ensemble.marketWeight).toBe(1);
    expect(ensemble.modelWeight).toBe(0);
    const predicted = ensemblePredict(ensemble, {
      market: [0.5, 0.3, 0.2],
      model: [0.1, 0.1, 0.8],
    });
    expect(predicted[0]).toBeCloseTo(0.5, 10);
    expect(predicted[1]).toBeCloseTo(0.3, 10);
    expect(predicted[2]).toBeCloseTo(0.2, 10);
  });

  it("is what an empty fitting set produces", () => {
    expect(fitMarketEnsemble([], 3)).toMatchObject({
      marketWeight: 1,
      modelWeight: 0,
      sampleCount: 0,
    });
  });

  it("always returns a proper distribution", () => {
    const predicted = ensemblePredict(marketOnlyEnsemble(3), {
      market: [0, 0, 0],
      model: [0, 0, 0],
    });
    expect(predicted.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 10);
  });
});

describe("fitting the stacker", () => {
  it("puts no weight on a model that is pure noise", () => {
    /*
     * The null hypothesis made testable. If the football signal is
     * uncorrelated with the outcome, the fit has to conclude the market was
     * already right — and report that rather than blending anyway.
     */
    const fitted = fitMarketEnsemble(marketIsRight(4000, 0.5), 2);
    expect(Math.abs(fitted.modelWeight)).toBeLessThan(0.05);
    expect(modelContribution(fitted)).toBeLessThan(0.06);
  });

  it("picks the model up when the model genuinely knows more", () => {
    // The other direction, so a near-zero weight above is evidence about the
    // data rather than a stacker that cannot learn.
    const fitted = fitMarketEnsemble(modelIsRight(4000), 2);
    expect(fitted.modelWeight).toBeGreaterThan(0.3);
    expect(modelContribution(fitted)).toBeGreaterThan(0.2);
  });

  it("is deterministic, so the artifact stays fingerprintable", () => {
    const samples = modelIsRight(1000);
    const first = fitMarketEnsemble(samples, 2);
    const second = fitMarketEnsemble(samples, 2);
    expect(second.marketWeight).toBe(first.marketWeight);
    expect(second.modelWeight).toBe(first.modelWeight);
    expect(second.intercepts).toEqual(first.intercepts);
  });

  it("pins the last intercept so the softmax cannot drift", () => {
    // Softmax is invariant to a constant added to every score, so without a
    // pin the intercepts wander along that flat direction forever.
    const fitted = fitMarketEnsemble(modelIsRight(500), 2);
    expect(fitted.intercepts.at(-1)).toBe(0);
  });

  it("ignores samples whose feature vectors do not match the market", () => {
    const fitted = fitMarketEnsemble(
      [
        { market: [0.5, 0.5], model: [0.5, 0.5], observedIndex: 0 },
        { market: [0.5, 0.3, 0.2], model: [0.5, 0.5], observedIndex: 0 },
        { market: [0.5, 0.5], model: [0.5, 0.5], observedIndex: 7 },
      ],
      2,
    );
    expect(fitted.sampleCount).toBe(1);
  });

  it("produces a proper distribution for any input", () => {
    const fitted = fitMarketEnsemble(modelIsRight(500), 2);
    for (const market of [
      [0.5, 0.5],
      [0.99, 0.01],
      [0.01, 0.99],
      [0, 1],
    ] as const) {
      const predicted = ensemblePredict(fitted, {
        market,
        model: [0.4, 0.6],
      });
      expect(predicted.reduce((sum, value) => sum + value, 0)).toBeCloseTo(
        1,
        10,
      );
      expect(predicted.every((value) => value >= 0 && value <= 1)).toBe(true);
    }
  });
});

describe("disagreement buckets", () => {
  const records: DisagreementRecord[] = [
    {
      marketProbability: 0.3,
      modelProbability: 0.5,
      occurred: true,
      closingProbability: 0.32,
    },
    {
      marketProbability: 0.3,
      modelProbability: 0.5,
      occurred: false,
      closingProbability: 0.28,
    },
    {
      marketProbability: 0.5,
      modelProbability: 0.3,
      occurred: false,
      closingProbability: 0.52,
    },
    {
      marketProbability: 0.4,
      modelProbability: 0.4,
      occurred: true,
      closingProbability: null,
    },
  ];

  it("reports every fixed bucket, including the empty ones", () => {
    /*
     * The boundaries are fixed in advance and the empty buckets are reported
     * as empty. Selecting the flattering ones afterwards is exactly how a
     * backtest manufactures an edge.
     */
    const buckets = bucketDisagreement(records);
    expect(buckets).toHaveLength(7);
    expect(
      buckets.filter((bucket) => bucket.samples === 0).length,
    ).toBeGreaterThan(0);
  });

  it("puts the observed frequency beside what the market expected", () => {
    // The comparison is the whole test: if disagreement carries information,
    // bullish buckets should beat the market's own expectation.
    const buckets = bucketDisagreement(records);
    const bullish = buckets.find(
      (bucket) => bucket.lowerBound === 0.1 && bucket.samples > 0,
    );
    expect(bullish).toBeDefined();
    expect(bullish?.samples).toBe(2);
    expect(bullish?.observedFrequency).toBeCloseTo(0.5, 10);
    expect(bullish?.marketExpectedFrequency).toBeCloseTo(0.3, 10);
    expect(bullish?.modelExpectedFrequency).toBeCloseTo(0.5, 10);
  });

  it("reports NaN rather than zero for an empty bucket", () => {
    const empty = bucketDisagreement([]).find((bucket) => bucket.samples === 0);
    expect(empty?.observedFrequency).toBeNaN();
    expect(empty?.meanClosingMovement).toBeNull();
  });

  it("counts closing movement only where a closing price existed", () => {
    const buckets = bucketDisagreement(records);
    const middle = buckets.find((bucket) => bucket.lowerBound === -0.02);
    expect(middle?.samples).toBe(1);
    expect(middle?.closingSamples).toBe(0);
    expect(middle?.meanClosingMovement).toBeNull();
  });
});

describe("the closing-line study", () => {
  it("measures a different target from match outcome", () => {
    /*
     * Deliberately separate. A signal that spots prices the market later
     * moves toward is useful on its own, and can be present where outcome
     * prediction fails or absent where it succeeds — conflating them is how a
     * CLV result gets mis-sold as predictive edge.
     */
    const study = studyClosingLine([
      {
        marketProbability: 0.3,
        modelProbability: 0.5,
        occurred: false,
        closingProbability: 0.4,
      },
      {
        marketProbability: 0.4,
        modelProbability: 0.6,
        occurred: false,
        closingProbability: 0.5,
      },
      {
        marketProbability: 0.5,
        modelProbability: 0.3,
        occurred: true,
        closingProbability: 0.4,
      },
      {
        marketProbability: 0.6,
        modelProbability: 0.4,
        occurred: true,
        closingProbability: 0.5,
      },
    ]);
    // Bullish disagreement always preceded a rise here, bearish always a fall.
    expect(study.disagreementMovementCorrelation).toBeGreaterThan(0.9);
    expect(study.shortenedWhenModelBullish).toBe(1);
    expect(study.shortenedWhenModelBearish).toBe(0);
  });

  it("reports the bearish share too, because the bullish one alone says nothing", () => {
    // A market drifting toward everything would give a high bullish share
    // with no signal in it at all.
    const drifting = studyClosingLine([
      {
        marketProbability: 0.3,
        modelProbability: 0.5,
        occurred: false,
        closingProbability: 0.35,
      },
      {
        marketProbability: 0.5,
        modelProbability: 0.3,
        occurred: false,
        closingProbability: 0.55,
      },
    ]);
    expect(drifting.shortenedWhenModelBullish).toBe(1);
    expect(drifting.shortenedWhenModelBearish).toBe(1);
  });

  it("refuses to compute a correlation from too little data", () => {
    expect(
      studyClosingLine([
        {
          marketProbability: 0.3,
          modelProbability: 0.5,
          occurred: true,
          closingProbability: 0.4,
        },
      ]).disagreementMovementCorrelation,
    ).toBeNaN();
  });

  it("ignores records with no closing price rather than treating them as zero movement", () => {
    const study = studyClosingLine([
      {
        marketProbability: 0.3,
        modelProbability: 0.5,
        occurred: true,
        closingProbability: null,
      },
      {
        marketProbability: 0.4,
        modelProbability: 0.6,
        occurred: true,
        closingProbability: 0.5,
      },
      {
        marketProbability: 0.5,
        modelProbability: 0.3,
        occurred: true,
        closingProbability: 0.4,
      },
    ]);
    expect(study.samples).toBe(2);
  });
});

describe("feature discipline", () => {
  it("classifies the closing price as evidence only, never as a feature", () => {
    // The leak every other guard exists to prevent.
    expect(featureClassOf("CLOSING_PRICE")).toBe("EVIDENCE_ONLY_FEATURE");
  });

  it("classifies current injuries and lineups as evidence only", () => {
    /*
     * Both are easy to fetch and impossible to reconstruct at a past cutoff,
     * so training on them would produce inference nothing validated.
     */
    expect(featureClassOf("CURRENT_INJURIES")).toBe("EVIDENCE_ONLY_FEATURE");
    expect(featureClassOf("CONFIRMED_LINEUP")).toBe("EVIDENCE_ONLY_FEATURE");
  });

  it("classifies another vendor's model as a benchmark, not an input", () => {
    expect(featureClassOf("API_SPORTS_PREDICTIONS")).toBe("EXTERNAL_BENCHMARK");
  });

  it("admits only the two features the backtest actually reconstructs", () => {
    const modelled = FEATURE_REGISTRY.filter(
      (entry) => entry.featureClass === "MODELLED_FEATURE",
    ).map((entry) => entry.code);
    expect(modelled).toEqual([
      "MARKET_CONSENSUS_PRE_CLOSING",
      "DIXON_COLES_SCORE_MODEL",
    ]);
  });

  it("refuses a training set containing a non-modelled feature, and names it", () => {
    // Refusing beats filtering: a run that quietly dropped a feature someone
    // believed was included is worse than one that will not start.
    expect(
      assertTrainableFeatures([
        "MARKET_CONSENSUS_PRE_CLOSING",
        "DIXON_COLES_SCORE_MODEL",
      ]),
    ).toEqual({ ok: true, offending: [] });
    expect(
      assertTrainableFeatures([
        "MARKET_CONSENSUS_PRE_CLOSING",
        "CLOSING_PRICE",
        "CURRENT_INJURIES",
      ]),
    ).toEqual({
      ok: false,
      offending: ["CLOSING_PRICE", "CURRENT_INJURIES"],
    });
  });

  it("treats an unregistered feature as inadmissible rather than assuming", () => {
    expect(featureClassOf("SOMETHING_NEW")).toBeNull();
    expect(assertTrainableFeatures(["SOMETHING_NEW"]).ok).toBe(false);
  });

  it("gives every declaration a real rationale", () => {
    for (const entry of FEATURE_REGISTRY) {
      expect(entry.rationale.length).toBeGreaterThan(60);
      expect(entry.source.length).toBeGreaterThan(0);
    }
  });
});

describe("no closing-price leakage in the v1 backtest", () => {
  it("never reads the closing field", () => {
    /*
     * A source assertion, because this is a leak the type system cannot
     * catch: `closingAverageOdds` is on the corpus row, so any future edit
     * could read it as a feature and every metric would silently improve.
     */
    const source = readFileSync(
      path.resolve(import.meta.dirname, "../src/backtest.ts"),
      "utf8",
    );
    const code = source
      .split("\n")
      .filter((line) => !line.trim().startsWith("*"))
      .join("\n");
    expect(code).not.toContain("closingAverageOdds[");
    expect(code).not.toContain("closingAverageOdds?.[");
  });

  it("reads it in the v2 harness only as an evaluation target", () => {
    const source = readFileSync(
      path.resolve(import.meta.dirname, "../src/backtest-v2.ts"),
      "utf8",
    );
    // Present exactly once, and on the `closing` field that feeds the
    // closing-line study rather than the stacking features.
    expect(source).toContain("closing: devigged(match.closingAverageOdds");
    expect(source).not.toContain("market: devigged(match.closingAverageOdds");
    expect(source).not.toContain("model: devigged(match.closingAverageOdds");
  });
});

describe("the ensemble verdict", () => {
  const segment = (
    holdoutSamples: number,
    marketLogLoss: number,
    v2LogLoss: number,
  ) => ({
    marketCode: "FOOTBALL_FULL_TIME_1X2" as const,
    outcomeCount: 3,
    competitionCode: "TEST",
    holdoutSamples,
    market: {
      sampleCount: holdoutSamples,
      brier: 0.6,
      logLoss: marketLogLoss,
      calibrationError: 0.03,
    },
    modelV1: {
      sampleCount: holdoutSamples,
      brier: 0.61,
      logLoss: 1.01,
      calibrationError: 0.04,
    },
    modelV2: {
      sampleCount: holdoutSamples,
      brier: 0.6,
      logLoss: v2LogLoss,
      calibrationError: 0.03,
    },
    deltaLogLossVsMarket: v2LogLoss - marketLogLoss,
    deltaBrierVsMarket: 0,
  });

  const ensembles = [
    { marketCode: "FOOTBALL_FULL_TIME_1X2" as const, modelContribution: 0.05 },
  ];

  it("calls a difference inside the noise floor a match, not an improvement", () => {
    // 0.0004 nats on a six-thousand-row holdout is a rounding difference, and
    // reporting it as an improvement would be the false-edge failure itself.
    const { verdict } = decideEnsembleVerdict(
      [segment(6000, 0.9772, 0.9768)],
      ensembles,
    );
    expect(verdict).toBe("MATCHES_MARKET");
  });

  it("calls a real improvement an improvement", () => {
    expect(
      decideEnsembleVerdict([segment(6000, 0.98, 0.95)], ensembles).verdict,
    ).toBe("IMPROVES_MARKET");
  });

  it("calls a real regression a regression", () => {
    expect(
      decideEnsembleVerdict([segment(6000, 0.95, 0.99)], ensembles).verdict,
    ).toBe("UNDERPERFORMS_MARKET");
  });

  it("weights segments by sample count rather than counting wins", () => {
    // A per-competition tally lets the smallest league outvote the largest.
    const { verdict } = decideEnsembleVerdict(
      [segment(100, 0.9, 0.8), segment(10000, 0.9, 0.95)],
      ensembles,
    );
    expect(verdict).toBe("UNDERPERFORMS_MARKET");
  });

  it("says plainly when the fit put no weight on the model", () => {
    const { verdictReasons } = decideEnsembleVerdict(
      [segment(6000, 0.9772, 0.9772)],
      [
        {
          marketCode: "FOOTBALL_FULL_TIME_1X2" as const,
          modelContribution: 0,
        },
      ],
    );
    expect(verdictReasons).toContain("ENSEMBLE_PUT_NO_WEIGHT_ON_MODEL");
  });

  it("refuses a verdict with no market baseline to compare against", () => {
    const { verdict, verdictReasons } = decideEnsembleVerdict([], ensembles);
    expect(verdict).toBe("UNDERPERFORMS_MARKET");
    expect(verdictReasons).toEqual(["NO_COMPARABLE_MARKET_BASELINE"]);
  });
});
