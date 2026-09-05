import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceDirectory = path.resolve(scriptDirectory, "../..");

const stages = Object.freeze({
  reset: Object.freeze([
    Object.freeze(["start"]),
    Object.freeze(["db", "reset", "--local"]),
  ]),
  test: Object.freeze([
    Object.freeze(["start"]),
    Object.freeze(["db", "reset", "--local"]),
    Object.freeze(["test", "db", "--local"]),
  ]),
  verify: Object.freeze([
    Object.freeze(["start"]),
    Object.freeze(["db", "reset", "--local"]),
    Object.freeze(["migration", "list", "--local"]),
    Object.freeze(["test", "db", "--local"]),
    Object.freeze(["db", "lint", "--local", "--fail-on", "error"]),
    Object.freeze(["db", "advisors", "--local", "--fail-on", "error"]),
  ]),
});

export function resolveDatabaseStage(stageName) {
  const stage = stages[stageName];
  if (!stage) {
    throw new Error(
      `Unknown database stage "${stageName}". Expected reset, test, or verify.`,
    );
  }

  return stage.map((command) => [...command]);
}

export function resolveSupabaseInvocation() {
  const require = createRequire(import.meta.url);
  const packageJsonPath = require.resolve("supabase/package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  const packageEntry =
    typeof packageJson.bin === "string"
      ? packageJson.bin
      : packageJson.bin?.supabase;

  if (typeof packageEntry !== "string") {
    throw new Error(
      "Database prerequisite unavailable: the pinned Supabase package has no CLI entry point.",
    );
  }

  return {
    command: process.execPath,
    arguments: [path.resolve(path.dirname(packageJsonPath), packageEntry)],
  };
}

function checkDockerPrerequisite() {
  const result = spawnSync(
    "docker",
    ["version", "--format", "{{.Server.Version}}"],
    {
      cwd: workspaceDirectory,
      encoding: "utf8",
      shell: false,
      windowsHide: true,
    },
  );

  if (result.error?.code === "ENOENT") {
    throw new Error(
      "Database prerequisite unavailable: Docker CLI was not found on PATH. Install and start Docker Desktop before running local Supabase database stages.",
    );
  }

  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "").trim();
    throw new Error(
      `Database prerequisite unavailable: Docker is installed but its daemon is not reachable.${detail ? ` ${detail}` : " Start Docker Desktop and retry."}`,
    );
  }
}

function runStage(stageName) {
  const commands = resolveDatabaseStage(stageName);
  checkDockerPrerequisite();

  const supabase = resolveSupabaseInvocation();
  for (const command of commands) {
    const result = spawnSync(
      supabase.command,
      [...supabase.arguments, ...command],
      {
        cwd: workspaceDirectory,
        stdio: "inherit",
        shell: false,
        windowsHide: true,
      },
    );

    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}

const isMainModule =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  try {
    runStage(process.argv[2] ?? "verify");
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
