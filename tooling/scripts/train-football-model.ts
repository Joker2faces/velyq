import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  artifactFingerprint,
  decideMaturity,
  runBacktest,
  trainingDatasetFingerprint,
  type ModelArtifact,
} from "../../packages/research/src/index.js";
import { loadCorpus } from "./historical-corpus.js";

/**
 * Trains the football model offline and writes an immutable artifact.
 *
 * Training happens here and nowhere else. Production inference loads the
 * artifact this produces; it never refits, because a model that refits on
 * demand cannot reproduce yesterday's prediction and therefore cannot be
 * audited. The artifact carries the parameters, the calibrators, the measured
 * uncertainty profiles, the training cutoff, a fingerprint of the exact
 * training rows, the full validation report and the maturity the evidence
 * justifies — everything needed to explain a probability months later.
 *
 * Usage:
 *   pnpm model:train                      # default windowing
 *   pnpm model:train --step-days 120      # coarser walk-forward
 */

const MODEL_VERSION = "football-dixon-coles.v1";
const FEATURE_CONTRACT_VERSION = "football-goals-features.v1";

function numberArgument(name: string, fallback: number): number {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const value = Number(process.argv[index + 1]);
  return Number.isFinite(value) ? value : fallback;
}

export type TrainingOutcome = Readonly<{
  artifact: ModelArtifact;
  artifactReference: string;
  corpusFiles: number;
  corpusMatches: number;
}>;

export function trainFootballModel(
  options: Readonly<{
    corpusDirectory: string;
    initialTrainingDays?: number;
    stepDays?: number;
    holdoutFraction?: number;
  }>,
): TrainingOutcome {
  const corpus = loadCorpus(options.corpusDirectory);
  if (corpus.matches.length === 0) throw new Error("HISTORICAL_CORPUS_EMPTY");

  const backtest = runBacktest(corpus.matches, {
    /*
     * Three seasons before the first prediction window. Fewer and the earliest
     * windows are scored against a model that has not yet seen most of its
     * teams, which drags the reported metrics down for a reason that has
     * nothing to do with the model.
     */
    initialTrainingDays: options.initialTrainingDays ?? 1095,
    stepDays: options.stepDays ?? 90,
    /*
     * The most recent 15% of matches, never touched while hyperparameters or
     * the calibrator are chosen.
     */
    holdoutFraction: options.holdoutFraction ?? 0.15,
    devigMethod: "SHIN",
  });

  const trainingRows = corpus.matches.filter(
    (match) => match.kickoffDate < backtest.report.holdoutFrom,
  );
  const promotion = decideMaturity(backtest.report);

  const artifact: ModelArtifact = {
    modelCode: "FOOTBALL_DIXON_COLES",
    version: MODEL_VERSION,
    maturity: promotion.maturity,
    featureContractVersion: FEATURE_CONTRACT_VERSION,
    trainingCutoff: backtest.report.holdoutFrom,
    trainingDatasetFingerprint: trainingDatasetFingerprint(trainingRows),
    parameters: backtest.productionModel,
    calibrators: backtest.calibrators,
    uncertaintyProfiles: backtest.uncertaintyProfiles,
    validationReport: backtest.report,
  };

  return {
    artifact,
    artifactReference: artifactFingerprint(artifact),
    corpusFiles: corpus.files.length,
    corpusMatches: corpus.matches.length,
  };
}

async function main() {
  const corpusDirectory =
    process.env["VELYQ_HISTORICAL_CORPUS_DIR"] ??
    "data/historical/football-data";
  const outcome = trainFootballModel({
    corpusDirectory,
    initialTrainingDays: numberArgument("initial-training-days", 1095),
    stepDays: numberArgument("step-days", 90),
    holdoutFraction: numberArgument("holdout-fraction", 0.15),
  });

  const outputDirectory =
    process.env["VELYQ_MODEL_ARTIFACT_DIR"] ?? "data/historical/artifacts";
  mkdirSync(outputDirectory, { recursive: true });
  const artifactPath = path.join(
    outputDirectory,
    `${outcome.artifact.version}.json`,
  );
  writeFileSync(
    artifactPath,
    `${JSON.stringify(outcome.artifact, null, 2)}\n`,
    "utf8",
  );

  const summary = {
    artifactPath,
    artifactReference: outcome.artifactReference,
    version: outcome.artifact.version,
    maturity: outcome.artifact.maturity,
    trainingCutoff: outcome.artifact.trainingCutoff,
    trainingDatasetFingerprint: outcome.artifact.trainingDatasetFingerprint,
    corpusFiles: outcome.corpusFiles,
    corpusMatches: outcome.corpusMatches,
    teams: outcome.artifact.parameters.teams.length,
    competitions: outcome.artifact.parameters.competitions.length,
    rho: outcome.artifact.parameters.rho,
    converged: outcome.artifact.parameters.converged,
    iterations: outcome.artifact.parameters.iterations,
    walkForwardWindows:
      outcome.artifact.validationReport.walkForwardCutoffs.length,
    leakageAudit: outcome.artifact.validationReport.leakageAudit,
    trainRecords: outcome.artifact.validationReport.trainRecords,
    validationRecords: outcome.artifact.validationReport.validationRecords,
    holdoutRecords: outcome.artifact.validationReport.holdoutRecords,
    calibrators: outcome.artifact.calibrators.map((entry) => ({
      market: entry.marketCode,
      temperature: entry.calibrator.temperature,
      logLossBefore: entry.calibrator.logLossBefore,
      logLossAfter: entry.calibrator.logLossAfter,
    })),
    uncertaintyProfiles: outcome.artifact.uncertaintyProfiles.length,
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

if (process.argv[1]?.endsWith("train-football-model.ts")) void main();
