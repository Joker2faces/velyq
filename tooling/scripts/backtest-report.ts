import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type {
  MarketEvaluation,
  ModelArtifact,
} from "../../packages/research/src/index.js";

/**
 * Renders the validation report the trainer produced into a document a human
 * can read and a machine can diff.
 *
 * Generated rather than written, so it cannot drift from the artifact it
 * describes: every number here is read out of the registered artifact, and
 * re-running this after a retrain either reproduces the file or shows exactly
 * what changed.
 *
 * Reports metrics against baselines rather than ROI. A model's return on a
 * few hundred simulated bets is dominated by which side of a handful of coin
 * flips it happened to land on; log loss against an honest baseline on six
 * thousand holdout matches is not.
 *
 * Usage:
 *   pnpm model:report
 */

const MARKET_LABELS: Readonly<Record<string, string>> = {
  FOOTBALL_FULL_TIME_1X2: "Full-time 1X2",
  FOOTBALL_FULL_TIME_TOTAL: "Over/under 2.5",
  FOOTBALL_FULL_TIME_BTTS: "Both teams to score",
};

function round(value: number | undefined, places = 4): string {
  return value === undefined || !Number.isFinite(value)
    ? "—"
    : value.toFixed(places);
}

type MarketRollup = Readonly<{
  marketCode: string;
  competitions: number;
  holdoutSamples: number;
  logLoss: number;
  brier: number;
  calibrationError: number;
  baselines: Readonly<
    Record<
      string,
      Readonly<{ beaten: number; compared: number; logLoss: number }>
    >
  >;
}>;

/**
 * Aggregates per-competition evaluations into one row per market.
 *
 * Sample-weighted, because the competitions differ in size by a factor of two
 * and an unweighted mean would let the smallest league move the headline
 * number as much as the largest.
 */
export function rollupByMarket(
  artifact: ModelArtifact,
): readonly MarketRollup[] {
  const byMarket = new Map<
    string,
    {
      competitions: number;
      samples: number;
      logLoss: number;
      brier: number;
      calibrationError: number;
      baselines: Map<
        string,
        { beaten: number; compared: number; logLoss: number; samples: number }
      >;
    }
  >();

  for (const competition of artifact.validationReport.competitions)
    for (const market of competition.markets) {
      if (!market.holdout) continue;
      const entry = byMarket.get(market.marketCode) ?? {
        competitions: 0,
        samples: 0,
        logLoss: 0,
        brier: 0,
        calibrationError: 0,
        baselines: new Map(),
      };
      const weight = market.holdout.sampleCount;
      entry.competitions += 1;
      entry.samples += weight;
      entry.logLoss += market.holdout.logLoss * weight;
      entry.brier += market.holdout.brier * weight;
      entry.calibrationError += market.holdout.calibrationError * weight;
      for (const baseline of market.baselines) {
        const record = entry.baselines.get(baseline.code) ?? {
          beaten: 0,
          compared: 0,
          logLoss: 0,
          samples: 0,
        };
        if (baseline.modelBeatsOnHoldout !== null) {
          record.compared += 1;
          if (baseline.modelBeatsOnHoldout) record.beaten += 1;
        }
        if (baseline.holdout) {
          record.logLoss +=
            baseline.holdout.logLoss * baseline.holdout.sampleCount;
          record.samples += baseline.holdout.sampleCount;
        }
        entry.baselines.set(baseline.code, record);
      }
      byMarket.set(market.marketCode, entry);
    }

  return [...byMarket.entries()].map(([marketCode, entry]) => ({
    marketCode,
    competitions: entry.competitions,
    holdoutSamples: entry.samples,
    logLoss: entry.logLoss / Math.max(1, entry.samples),
    brier: entry.brier / Math.max(1, entry.samples),
    calibrationError: entry.calibrationError / Math.max(1, entry.samples),
    baselines: Object.fromEntries(
      [...entry.baselines.entries()].map(([code, record]) => [
        code,
        {
          beaten: record.beaten,
          compared: record.compared,
          /*
           * NaN, not zero, when the baseline had no samples at all. A
           * missing comparison rendered as 0.0000 reads as a baseline the
           * model lost to catastrophically, when in fact the source carries
           * no such price — which is the case for both-teams-to-score.
           */
          logLoss:
            record.samples === 0 ? Number.NaN : record.logLoss / record.samples,
        },
      ]),
    ),
  }));
}

function competitionRows(
  competitionCode: string,
  markets: readonly MarketEvaluation[],
): readonly string[] {
  return markets
    .filter((market) => market.holdout !== null)
    .map((market) => {
      const baseline = (code: string) =>
        market.baselines.find((entry) => entry.code === code);
      const verdict = (code: string) => {
        const entry = baseline(code);
        if (!entry || entry.modelBeatsOnHoldout === null) return "n/a";
        return entry.modelBeatsOnHoldout ? "model" : "baseline";
      };
      return `| ${competitionCode} | ${MARKET_LABELS[market.marketCode] ?? market.marketCode} | ${market.trainSampleCount} | ${market.validation.sampleCount} | ${market.holdout?.sampleCount ?? 0} | ${round(market.holdout?.logLoss)} | ${round(market.holdout?.brier)} | ${round(market.holdout?.calibrationError)} | ${verdict("EMPIRICAL_FREQUENCY")} | ${verdict("INDEPENDENT_POISSON")} | ${verdict("MARKET_CONSENSUS")} |`;
    });
}

export function renderBacktestReport(artifact: ModelArtifact): string {
  const report = artifact.validationReport;
  const rollups = rollupByMarket(artifact);
  const lines: string[] = [];

  lines.push("# Football model backtest");
  lines.push("");
  lines.push(
    "Generated by `pnpm model:report` from the registered artifact. Do not edit by hand — every number here is read out of the artifact, so editing this file only makes it disagree with the model.",
  );
  lines.push("");
  lines.push("## What was fitted");
  lines.push("");
  lines.push(`- **Model**: ${artifact.modelCode} \`${artifact.version}\``);
  lines.push(`- **Maturity**: ${artifact.maturity}`);
  lines.push(`- **Feature contract**: \`${artifact.featureContractVersion}\``);
  lines.push(`- **Training cutoff**: ${artifact.trainingCutoff}`);
  lines.push(
    `- **Training dataset fingerprint**: \`${artifact.trainingDatasetFingerprint}\``,
  );
  lines.push(`- **Corpus sources**: ${report.corpusSourceCodes.join(", ")}`);
  lines.push(
    `- **Teams**: ${artifact.parameters.teams.length} across ${artifact.parameters.competitions.length} competitions`,
  );
  lines.push(
    `- **Dixon-Coles ρ**: ${artifact.parameters.rho.toFixed(6)} (negative lifts 0-0 and 1-1 above independent Poisson, as the literature finds)`,
  );
  lines.push(
    `- **Fit**: ${artifact.parameters.converged ? "converged" : "hit the iteration ceiling"} after ${artifact.parameters.iterations} iterations on ${artifact.parameters.matchesUsed} matches`,
  );
  lines.push("");
  lines.push("## How it was validated");
  lines.push("");
  lines.push(
    `- **Walk-forward windows**: ${report.walkForwardCutoffs.length}, first cutoff ${report.walkForwardCutoffs[0] ?? "—"}, last ${report.walkForwardCutoffs.at(-1) ?? "—"}`,
  );
  lines.push(
    `- **Split**: ${report.trainRecords} initial training / ${report.validationRecords} walk-forward validation / ${report.holdoutRecords} untouched holdout from ${report.holdoutFrom}`,
  );
  lines.push(
    `- **Leakage audit**: ${report.leakageAudit.ok ? "PASS" : `FAIL (${report.leakageAudit.violations} violations)`}`,
  );
  lines.push("");
  lines.push(
    "No random split. Each window trains strictly before its own cutoff and predicts only the matches after it, the cutoff advances forward in time, and the holdout is the most recent stretch of matches — carved off before any hyperparameter or calibrator was chosen. The audit checks the realised row sets rather than the window bounds, because bounds that look right with an off-by-one filter produce a leak no amount of reading the definition would reveal.",
  );
  lines.push("");
  lines.push("## Calibration");
  lines.push("");
  lines.push("| Market | Temperature | Log loss before | after | Fitted on |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const entry of artifact.calibrators)
    lines.push(
      `| ${MARKET_LABELS[entry.marketCode] ?? entry.marketCode} | ${entry.calibrator.temperature} | ${round(entry.calibrator.logLossBefore)} | ${round(entry.calibrator.logLossAfter)} | ${entry.calibrator.fittedOn} |`,
    );
  lines.push("");
  lines.push(
    "Temperature scaling, fitted on the walk-forward validation predictions and never on the rows the model is scored on. A temperature above 1 means the raw model was overconfident. It cannot reorder outcomes, so it cannot manufacture an edge the model did not already see; a temperature of exactly 1 means calibration did not help and the identity was kept.",
  );
  lines.push("");
  lines.push("## Holdout, by market");
  lines.push("");
  lines.push(
    "| Market | Competitions | Holdout n | Log loss | Brier | Calibration error | Beat base rates | Beat ratio Poisson | Beat market |",
  );
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const rollup of rollups) {
    const beat = (code: string) => {
      const entry = rollup.baselines[code];
      if (!entry || entry.compared === 0) return "n/a";
      return `${entry.beaten}/${entry.compared}`;
    };
    lines.push(
      `| ${MARKET_LABELS[rollup.marketCode] ?? rollup.marketCode} | ${rollup.competitions} | ${rollup.holdoutSamples} | ${round(rollup.logLoss)} | ${round(rollup.brier)} | ${round(rollup.calibrationError)} | ${beat("EMPIRICAL_FREQUENCY")} | ${beat("INDEPENDENT_POISSON")} | ${beat("MARKET_CONSENSUS")} |`,
    );
  }
  lines.push("");
  lines.push("### Baseline log loss, for comparison");
  lines.push("");
  lines.push("| Market | Model | Base rates | Ratio Poisson | Market |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const rollup of rollups)
    lines.push(
      `| ${MARKET_LABELS[rollup.marketCode] ?? rollup.marketCode} | ${round(rollup.logLoss)} | ${round(rollup.baselines["EMPIRICAL_FREQUENCY"]?.logLoss)} | ${round(rollup.baselines["INDEPENDENT_POISSON"]?.logLoss)} | ${round(rollup.baselines["MARKET_CONSENSUS"]?.logLoss)} |`,
    );
  lines.push("");
  lines.push("Three baselines, scored on exactly the same holdout rows:");
  lines.push("");
  lines.push(
    "- **Base rates** — how often each outcome occurred in the training window. A model that cannot beat this has learned nothing about the specific match.",
  );
  lines.push(
    "- **Ratio Poisson** — the competition's mean home and away goals scaled by each team's own scoring and conceding ratio, assuming independence. Same information as the Dixon-Coles fit, none of its machinery.",
  );
  lines.push(
    "- **Market** — the de-vigged consensus of the panel's pre-closing prices. A model that cannot match this has learned nothing *useful*. Absent for both-teams-to-score because the publisher carries no BTTS column at all, so there is no historical price to compare against; an absent comparison is reported as `n/a` and never as a win.",
  );
  lines.push("");
  lines.push("## Holdout, by competition");
  lines.push("");
  lines.push(
    "| Competition | Market | Train n | Validation n | Holdout n | Log loss | Brier | Calibration error | vs base rates | vs ratio Poisson | vs market |",
  );
  lines.push(
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  );
  for (const competition of report.competitions)
    for (const row of competitionRows(
      competition.competitionCode,
      competition.markets,
    ))
      lines.push(row);
  lines.push("");
  lines.push("## Uncertainty");
  lines.push("");
  lines.push(
    `${artifact.uncertaintyProfiles.length} measured profiles, one per competition and market that had enough validation samples to build one.`,
  );
  lines.push("");
  lines.push(
    "A band is measured or it does not exist. For a given probability level it comes from that band's own bias — how far the observed frequency sat from the mean forecast — plus the binomial standard error of that frequency. There is no default band and no fallback: too few samples returns nothing, and the FORTRESS gate already treats a missing bound as disqualifying, so a decision that needs an interval it cannot measure fails closed.",
  );
  lines.push("");
  lines.push("## What this does and does not establish");
  lines.push("");
  lines.push(
    "The maturity above is EXPERIMENTAL, and that is not a placeholder. The promotion policy requires the untouched holdout to show the model beating every available baseline in every market, and it additionally requires a live forward-tested record, which cannot exist on the day a model is first fitted. The FORTRESS gate refuses anything EXPERIMENTAL, so this model physically cannot produce a customer recommendation through that path.",
  );
  lines.push("");
  lines.push(
    "Read the market column before drawing any conclusion about edge. Where the model does not beat the de-vigged market consensus, a positive edge it reports against a market price is not yet evidence that the edge is real — it is more likely evidence that the model is worse than the market at that particular market. That is the expected result for a first Dixon-Coles fit and the reason every decision from it is labelled EXPERIMENTAL.",
  );
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function main() {
  const artifactDirectory =
    process.env["VELYQ_MODEL_ARTIFACT_DIR"] ?? "data/historical/artifacts";
  const artifact = JSON.parse(
    readFileSync(
      path.join(artifactDirectory, "football-dixon-coles.v1.json"),
      "utf8",
    ),
  ) as ModelArtifact;

  const outputDirectory =
    process.env["VELYQ_RESEARCH_DOCS_DIR"] ?? "docs/research";
  mkdirSync(outputDirectory, { recursive: true });
  const humanPath = path.join(outputDirectory, "football-model-backtest.md");
  const machinePath = path.join(
    outputDirectory,
    "football-model-backtest.json",
  );
  writeFileSync(humanPath, renderBacktestReport(artifact), "utf8");
  writeFileSync(
    machinePath,
    `${JSON.stringify(
      {
        modelCode: artifact.modelCode,
        version: artifact.version,
        maturity: artifact.maturity,
        trainingCutoff: artifact.trainingCutoff,
        trainingDatasetFingerprint: artifact.trainingDatasetFingerprint,
        calibrators: artifact.calibrators,
        uncertaintyProfiles: artifact.uncertaintyProfiles.length,
        byMarket: rollupByMarket(artifact),
        validationReport: artifact.validationReport,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  process.stdout.write(
    `${JSON.stringify({ humanPath, machinePath }, null, 2)}\n`,
  );
}

if (process.argv[1]?.endsWith("backtest-report.ts")) void main();
