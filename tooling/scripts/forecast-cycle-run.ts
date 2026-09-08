import { readFileSync } from "node:fs";
import path from "node:path";

import { loadModelArtifact } from "../../packages/research/src/index.js";
import { runForecastCycle } from "../../packages/application/src/forecast-cycle.js";
import { createForecastCycleDbAdapter } from "../../packages/database/src/repositories/forecast-cycle-adapter.js";
import { createPrivilegedDatabaseClient } from "../../packages/database/src/client.js";

/**
 * Runs the real forecast cycle against whatever database this shell's
 * environment is configured for -- no embedded credentials, no
 * hardcoded connection string. Reads the same env var names the
 * deployed app itself uses (`VELYQ_DATABASE_URL`, falling back to a
 * plain `DATABASE_URL` for local/CI use), so pointing this at staging or
 * production is "set the env var in your shell", never "paste a
 * connection string into a flag or into chat".
 *
 * Usage:
 *   pnpm forecast:run
 *   pnpm forecast:run -- --from 2026-09-25T00:00:00Z --to 2026-09-26T00:00:00Z
 *   pnpm forecast:run -- --mode SYNTHETIC_DEMO
 *   pnpm forecast:run -- --dry-run
 */

const DEFAULT_WINDOW_HOURS = 24;
const PROVIDER_CODE = "API_SPORTS";

function readFlag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function loadArtifact() {
  const artifactsDir = path.resolve(
    import.meta.dirname,
    "../../packages/research/artifacts",
  );
  const raw = JSON.parse(
    readFileSync(
      path.join(artifactsDir, "football-dixon-coles.v1.json"),
      "utf8",
    ),
  ) as unknown;
  const meta = JSON.parse(
    readFileSync(
      path.join(artifactsDir, "football-dixon-coles.v1.meta.json"),
      "utf8",
    ),
  ) as { artifactReference: string };

  const result = loadModelArtifact(raw, meta.artifactReference);
  if (!result.ok) {
    throw new Error(`MODEL_ARTIFACT_INVALID: ${result.reason}`);
  }
  return result.value;
}

async function main() {
  const connectionString =
    process.env["VELYQ_DATABASE_URL"] ?? process.env["DATABASE_URL"];
  if (!connectionString) {
    console.error(
      "No database configured: set VELYQ_DATABASE_URL (or DATABASE_URL) in this shell's environment before running.",
    );
    process.exitCode = 1;
    return;
  }

  const now = new Date();
  const from = readFlag("from") ? new Date(readFlag("from")!) : now;
  const to = readFlag("to")
    ? new Date(readFlag("to")!)
    : new Date(from.getTime() + DEFAULT_WINDOW_HOURS * 3_600_000);
  const mode = (readFlag("mode") ?? "LIVE") as "LIVE" | "SYNTHETIC_DEMO";
  const dryRun = process.argv.includes("--dry-run");

  console.log(
    JSON.stringify({
      event: "forecast-cycle-run started",
      from: from.toISOString(),
      to: to.toISOString(),
      mode,
      dryRun,
    }),
  );

  const modelArtifact = loadArtifact();
  const client = createPrivilegedDatabaseClient({ connectionString });
  try {
    const adapter = await createForecastCycleDbAdapter(client.database, {
      modelArtifact,
      providerCode: PROVIDER_CODE,
      dataOrigin: mode,
    });

    if (dryRun) {
      // A dry run reports what the cycle would scan without persisting
      // anything -- it calls the same fixture-loading port the real cycle
      // uses, just not the rest of the pipeline, so it cannot report
      // eligibility/coverage counts, only "how many fixtures are in this
      // window right now".
      const fixtures = await adapter.loadEligibleFixtures({ from, to });
      console.log(
        JSON.stringify({
          event: "forecast-cycle-run dry-run result",
          fixturesInWindow: fixtures.length,
        }),
      );
      return;
    }

    const result = await runForecastCycle(adapter, { from, to });
    console.log(
      JSON.stringify({ event: "forecast-cycle-run completed", ...result }),
    );
  } finally {
    await client.close();
  }
}

main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      event: "forecast-cycle-run failed",
      message: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    }),
  );
  process.exitCode = 1;
});
