import { readFileSync } from "node:fs";
import path from "node:path";

import { createPrivilegedDatabaseClient } from "../../packages/database/src/client.js";
import { ingestFootballDataFixtures } from "../../workers/ingestion/src/football-data-fixtures.js";
import {
  registerModelArtifact,
  runPreEventPredictionCycle,
} from "../../workers/prediction/src/index.js";
import {
  artifactFingerprint,
  decodeSourceBytes,
  type ModelArtifact,
} from "../../packages/research/src/index.js";

/**
 * The server-side prediction cycle, end to end.
 *
 * Four stages in the order they have to happen, which is the order that was
 * missing: register the trained artifact, ingest today's real fixtures and
 * prices, run the model against the events that qualify, then drain the job
 * queue so the predictions and their EDGE and RADAR scores are actually
 * written.
 *
 * Deliberately a job, never a request handler. A prediction created by a page
 * load would have a forecast timestamp determined by when somebody happened to
 * visit, and traffic would decide how much provider quota the pipeline spends.
 *
 * Usage:
 *   pnpm intelligence:cycle                 # register, ingest, predict, drain
 *   pnpm intelligence:cycle --dry-run       # evaluate and report, write nothing
 *   pnpm intelligence:cycle --skip-ingest   # reuse the events already stored
 */

function flag(name: string) {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const connectionString =
    process.env["VELYQ_LOCAL_DATABASE_URL"] ??
    process.env["VELYQ_DATABASE_URL"];
  if (!connectionString) throw new Error("VELYQ_DATABASE_URL_UNAVAILABLE");
  const corpusDirectory =
    process.env["VELYQ_HISTORICAL_CORPUS_DIR"] ??
    "data/historical/football-data";
  const artifactDirectory =
    process.env["VELYQ_MODEL_ARTIFACT_DIR"] ?? "data/historical/artifacts";
  const dryRun = flag("dry-run");

  const client = createPrivilegedDatabaseClient({ connectionString, max: 1 });
  const summary: Record<string, unknown> = { dryRun };
  try {
    if (!flag("skip-register")) {
      const artifact = JSON.parse(
        readFileSync(
          path.join(artifactDirectory, "football-dixon-coles.v1.json"),
          "utf8",
        ),
      ) as ModelArtifact;
      summary["registration"] = dryRun
        ? { skipped: "DRY_RUN" }
        : await registerModelArtifact({
            database: client.database,
            artifact,
            artifactReference: artifactFingerprint(artifact),
          });
    }

    /*
     * The as-of is taken after registration, not before. The competition
     * policy version is only in effect from the instant it is written, so a
     * cycle stamped earlier than its own registration step sees no policy at
     * all and reports every event as COMPETITION_NOT_IN_POLICY. In production
     * these are separate jobs and the ordering is implicit; in one combined
     * run it has to be explicit.
     */
    const asOf = new Date();
    summary["asOf"] = asOf.toISOString();

    if (!flag("skip-ingest")) {
      const csv = decodeSourceBytes(
        readFileSync(path.join(corpusDirectory, "fixtures.csv")),
      );
      summary["ingestion"] = dryRun
        ? { skipped: "DRY_RUN" }
        : await ingestFootballDataFixtures({
            database: client.database,
            csv,
            asOf,
          });
    }

    const cycle = await runPreEventPredictionCycle({
      database: client.database,
      asOf,
      triggerSource: "CLI",
      commit: !dryRun,
    });

    summary["cycle"] = {
      modelVersion: cycle.modelVersion,
      modelMaturity: cycle.modelMaturity,
      artifactReference: cycle.artifactReference,
      horizonHours: cycle.horizonHours,
      counts: cycle.counts,
      noBetReasons: cycle.noBetReasons,
      funnelRunId: cycle.funnelRunId,
      evaluations: cycle.evaluations.length,
      drained: cycle.drained,
    };
    summary["evaluations"] = cycle.evaluations;
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } finally {
    await client.close();
  }
}

if (process.argv[1]?.endsWith("prediction-cycle.ts")) void main();
