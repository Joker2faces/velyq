#!/usr/bin/env node
/**
 * Applies `supabase/migrations` to a plain PostgreSQL cluster.
 *
 * `pnpm db:*` shells out to the Supabase CLI, which needs Docker. Without
 * Docker there was no way at all to run a migration, exercise a repository, or
 * prove a pipeline actually writes what it claims — every database assertion
 * had to be taken on trust. This script closes that gap using nothing but a
 * connection string and `tooling/local-database/supabase-shim.sql`.
 *
 * It is deliberately NOT a replacement for `pnpm db:verify`: that runs pgTAP,
 * `db lint` and the security advisors against a real Supabase image, and stays
 * the authority. This is the Docker-free path for "does the SQL apply and does
 * the code behave against a real Postgres".
 *
 * Usage:
 *   node tooling/scripts/local-database.mjs bootstrap   # shim + migrations + seed
 *   node tooling/scripts/local-database.mjs migrate     # migrations only
 *   node tooling/scripts/local-database.mjs seed        # seed only
 *
 * Reads VELYQ_LOCAL_DATABASE_URL, falling back to VELYQ_DATABASE_URL. Refuses
 * to run against a host that is not loopback unless VELYQ_LOCAL_DATABASE_ALLOW_REMOTE
 * is set, so a stray production URL in the environment cannot be reset by
 * accident.
 */
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const workspaceDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

/*
 * `pg` is a dependency of @velyq/database, not of the workspace root, and
 * adding it to the root purely for this script would put a second copy of the
 * driver in the tree. Resolving it from the package that legitimately owns it
 * keeps one version installed.
 */
const pg = createRequire(
  path.join(workspaceDirectory, "packages/database/package.json"),
)("pg");

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function assertLocalConnection(connectionString, allowRemote = false) {
  const url = new URL(connectionString);
  if (allowRemote) return url;
  if (!LOOPBACK.has(url.hostname))
    throw new Error(
      `Refusing to apply migrations to non-loopback host "${url.hostname}". ` +
        "Set VELYQ_LOCAL_DATABASE_ALLOW_REMOTE=true only if you are certain.",
    );
  return url;
}

export function migrationFiles(directory) {
  return readdirSync(directory)
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

const STAGES = Object.freeze({
  bootstrap: Object.freeze(["shim", "migrate", "seed"]),
  migrate: Object.freeze(["migrate"]),
  seed: Object.freeze(["seed"]),
  shim: Object.freeze(["shim"]),
});

export function resolveStage(name) {
  const stage = STAGES[name];
  if (!stage)
    throw new Error(
      `Unknown stage "${name}". Expected one of ${Object.keys(STAGES).join(", ")}.`,
    );
  return [...stage];
}

async function applyFile(client, file, label) {
  const sql = readFileSync(file, "utf8");
  try {
    await client.query(sql);
  } catch (error) {
    throw new Error(
      `${label} failed (${path.basename(file)}): ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

async function main() {
  const stageName = process.argv[2] ?? "bootstrap";
  const steps = resolveStage(stageName);
  const connectionString =
    process.env["VELYQ_LOCAL_DATABASE_URL"] ??
    process.env["VELYQ_DATABASE_URL"];
  if (!connectionString)
    throw new Error("VELYQ_LOCAL_DATABASE_URL is required.");
  assertLocalConnection(
    connectionString,
    process.env["VELYQ_LOCAL_DATABASE_ALLOW_REMOTE"] === "true",
  );

  const client = new pg.Client({ connectionString });
  await client.connect();
  const applied = [];
  try {
    for (const step of steps) {
      if (step === "shim") {
        await applyFile(
          client,
          path.join(
            workspaceDirectory,
            "tooling/local-database/supabase-shim.sql",
          ),
          "shim",
        );
        applied.push("supabase-shim.sql");
        continue;
      }
      if (step === "migrate") {
        const directory = path.join(workspaceDirectory, "supabase/migrations");
        for (const name of migrationFiles(directory)) {
          await applyFile(client, path.join(directory, name), "migration");
          applied.push(name);
        }
        continue;
      }
      await applyFile(
        client,
        path.join(workspaceDirectory, "supabase/seed.sql"),
        "seed",
      );
      applied.push("seed.sql");
    }
  } finally {
    await client.end();
  }
  process.stdout.write(
    `${JSON.stringify({ stage: stageName, applied: applied.length, files: applied })}\n`,
  );
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1])))
  await main();
