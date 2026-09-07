import { createHash } from "node:crypto";
import type { Calibrator } from "./calibration.js";
import type { FittedModel } from "./dixon-coles.js";
import type { MetricSet } from "./metrics.js";
import type { UncertaintyProfile } from "./uncertainty.js";

/**
 * An immutable, fingerprinted model artifact.
 *
 * Production inference loads one of these and nothing else. That is the whole
 * point: a model that is refitted on demand cannot be audited, because the
 * prediction it produced last Tuesday can no longer be reproduced. Everything
 * needed to reproduce a probability — parameters, calibrator, training cutoff,
 * the fingerprint of the exact corpus used, the validation evidence, and the
 * declared maturity — travels together.
 *
 * `maturity` is not a label the trainer chooses freely. It is EXPERIMENTAL
 * until an explicit promotion policy is satisfied, and the FORTRESS gate
 * refuses anything EXPERIMENTAL, so an untried model physically cannot reach a
 * customer recommendation through this path.
 */

export type ModelMaturity =
  "EXPERIMENTAL" | "SHADOW" | "BACKTESTED" | "VALIDATED" | "PRODUCTION";

export type MarketEvaluation = Readonly<{
  marketCode: string;
  outcomeCount: number;
  trainSampleCount: number;
  validation: MetricSet;
  holdout: MetricSet | null;
  /** Same metrics for the honest baselines this has to beat. */
  baselines: readonly Readonly<{
    code: "EMPIRICAL_FREQUENCY" | "INDEPENDENT_POISSON" | "MARKET_CONSENSUS";
    validation: MetricSet;
    holdout: MetricSet | null;
    /** Whether the model beat this baseline on holdout log loss. */
    modelBeatsOnHoldout: boolean | null;
  }>[];
}>;

export type CompetitionEvaluation = Readonly<{
  competitionCode: string;
  matchesInCorpus: number;
  markets: readonly MarketEvaluation[];
}>;

export type ValidationReport = Readonly<{
  generatedAt: string;
  corpusSourceCodes: readonly string[];
  /** Every window's training cutoff, in order, so the schedule is auditable. */
  walkForwardCutoffs: readonly string[];
  holdoutFrom: string;
  trainRecords: number;
  validationRecords: number;
  holdoutRecords: number;
  leakageAudit: Readonly<{ ok: boolean; violations: number }>;
  competitions: readonly CompetitionEvaluation[];
}>;

export type ModelArtifact = Readonly<{
  modelCode: "FOOTBALL_DIXON_COLES";
  version: string;
  maturity: ModelMaturity;
  featureContractVersion: string;
  trainingCutoff: string;
  /** sha256 over the exact training rows used, in canonical order. */
  trainingDatasetFingerprint: string;
  parameters: FittedModel;
  calibrators: readonly Readonly<{
    marketCode: string;
    calibrator: Calibrator;
  }>[];
  uncertaintyProfiles: readonly UncertaintyProfile[];
  validationReport: ValidationReport;
}>;

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
}

/**
 * A fingerprint over the training rows, not over the file they came from.
 *
 * File-level checksums answer "did the download change", which is a different
 * question. This answers "was this model trained on exactly these matches" —
 * so two artifacts trained on the same matches assembled from differently
 * named files still fingerprint identically, and one extra match changes it.
 */
export function trainingDatasetFingerprint(
  rows: readonly Readonly<{
    competitionCode: string;
    homeTeamKey: string;
    awayTeamKey: string;
    homeGoals: number;
    awayGoals: number;
    kickoffDate: string;
  }>[],
): string {
  const canonicalRows = rows
    .map(
      (row) =>
        `${row.kickoffDate}|${row.competitionCode}|${row.homeTeamKey}|${row.awayTeamKey}|${row.homeGoals}-${row.awayGoals}`,
    )
    .sort();
  const digest = createHash("sha256");
  digest.update(String(canonicalRows.length));
  for (const row of canonicalRows) digest.update("\n").update(row);
  return `sha256:${digest.digest("hex")}`;
}

/** Identity of the artifact's own content, for `artifact_reference`. */
export function artifactFingerprint(artifact: ModelArtifact): string {
  return `sha256:${createHash("sha256").update(canonical(artifact)).digest("hex")}`;
}

export type PromotionDecision = Readonly<{
  maturity: ModelMaturity;
  reasonCodes: readonly string[];
}>;

/**
 * Decides how mature the artifact is allowed to claim to be.
 *
 * Attractive backtest numbers on one sample are not a promotion. The bar for
 * anything above EXPERIMENTAL is that the holdout — untouched during
 * hyperparameter selection — shows the model beating *every* honest baseline
 * on log loss, in every evaluated market, with a real sample behind it. Even
 * then this returns BACKTESTED and not VALIDATED: the step to VALIDATED is a
 * live forward-tested record, which by definition cannot exist on the day a
 * model is first fitted.
 */
export const MINIMUM_HOLDOUT_SAMPLES = 500;

export function decideMaturity(report: ValidationReport): PromotionDecision {
  const reasonCodes: string[] = [];
  if (!report.leakageAudit.ok) {
    return {
      maturity: "EXPERIMENTAL",
      reasonCodes: ["WALK_FORWARD_LEAKAGE_DETECTED"],
    };
  }
  if (report.holdoutRecords < MINIMUM_HOLDOUT_SAMPLES)
    reasonCodes.push("HOLDOUT_SAMPLE_TOO_SMALL");

  const markets = report.competitions.flatMap(
    (competition) => competition.markets,
  );
  if (markets.length === 0) reasonCodes.push("NO_MARKET_EVALUATED");
  if (markets.some((market) => market.holdout === null))
    reasonCodes.push("HOLDOUT_NOT_EVALUATED");
  const lostToBaseline = markets.filter((market) =>
    market.baselines.some((baseline) => baseline.modelBeatsOnHoldout === false),
  );
  if (lostToBaseline.length > 0)
    reasonCodes.push("BASELINE_NOT_BEATEN_ON_HOLDOUT");

  /*
   * No forward-tested live record can exist yet, so this is the ceiling by
   * construction and stays here until a live ledger provides the evidence.
   */
  reasonCodes.push("NO_LIVE_FORWARD_TEST_RECORD");
  return {
    maturity: "EXPERIMENTAL",
    reasonCodes,
  };
}
