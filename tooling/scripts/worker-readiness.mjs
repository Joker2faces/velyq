import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_TIMEOUT_MS = 10_000;
const FIXED_CLOCK = "2026-09-03T11:00:00Z";

function outputFor(result) {
  return (result.stderr || result.stdout || result.error?.message || "").trim();
}

function failedProcess(step, result, timeoutMs) {
  if (result.error?.code === "ETIMEDOUT") {
    return {
      ok: false,
      message: `Worker readiness ${step} timed out after ${timeoutMs}ms.`,
    };
  }

  const detail = outputFor(result);
  return {
    ok: false,
    message: `Worker readiness ${step} failed${detail ? `: ${detail}` : "."}`,
  };
}

export function runWorkerReadiness(options = {}) {
  const root = options.root ?? path.resolve(import.meta.dirname, "../..");
  const fileExists = options.existsSync ?? existsSync;
  const spawn = options.spawnSync ?? spawnSync;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const ingestionConsumer = "workers/ingestion/dist/index.js";
  const predictionConsumer = "workers/prediction/dist/src/index.js";
  const replayCli = "workers/ingestion/dist/cli.js";

  for (const [label, artifact] of [
    ["ingestion consumer", ingestionConsumer],
    ["prediction consumer", predictionConsumer],
    ["ingestion replay CLI", replayCli],
  ]) {
    if (!fileExists(path.join(root, artifact))) {
      return {
        ok: false,
        message: `Worker readiness failed: built ${label} is missing.`,
      };
    }
  }

  const sharedSpawnOptions = {
    cwd: root,
    encoding: "utf8",
    timeout: timeoutMs,
    windowsHide: true,
  };
  const dependencyResult = spawn(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      'const { pathToFileURL } = await import("node:url"); await Promise.all(process.argv.slice(1).map((file) => import(pathToFileURL(file).href)));',
      ingestionConsumer,
      predictionConsumer,
    ],
    sharedSpawnOptions,
  );
  if (dependencyResult.status !== 0) {
    return failedProcess(
      dependencyResult.error?.code === "ETIMEDOUT"
        ? "dependency check"
        : "dependencies",
      dependencyResult,
      timeoutMs,
    );
  }

  const replayEnvironment = { ...(options.environment ?? process.env) };
  for (const name of [
    "VELYQ_DATABASE_URL",
    "VELYQ_DATABASE_DIRECT_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "VELYQ_PROVIDER_ID",
    "VELYQ_PROVIDER_POLICY_VERSION_ID",
    "VELYQ_QUALITY_POLICY_VERSION_ID",
  ]) {
    delete replayEnvironment[name];
  }

  const replayResult = spawn(process.execPath, [replayCli, FIXED_CLOCK], {
    ...sharedSpawnOptions,
    env: replayEnvironment,
  });
  if (replayResult.status !== 0) {
    return failedProcess("replay", replayResult, timeoutMs);
  }

  try {
    const replay = JSON.parse(replayResult.stdout.trim());
    if (
      !Array.isArray(replay.results) ||
      !replay.results.some(
        (result) => result.sequenceName === "sequence-01-opening",
      )
    ) {
      throw new Error("canonical sequence result is missing");
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : "invalid output";
    return {
      ok: false,
      message: `Worker readiness replay failed: ${detail}.`,
    };
  }

  return { ok: true, message: "Worker readiness: PASS" };
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  const result = runWorkerReadiness();
  const writer = result.ok ? console.log : console.error;
  writer(result.message);
  if (!result.ok) process.exitCode = 1;
}
