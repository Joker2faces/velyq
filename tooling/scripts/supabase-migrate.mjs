#!/usr/bin/env node
/**
 * Applies pending `supabase/migrations` to a hosted Supabase project,
 * forward-only, through the Management API.
 *
 * Why not the Supabase CLI: `supabase db push` needs the project's Postgres
 * password, and that password is not something this process should ever hold.
 * The Management API's query endpoint authenticates with the account access
 * token alone, which is the credential already available — so the database
 * password stays out of the picture entirely.
 *
 * The safety properties, all of which are enforced rather than assumed:
 *
 * - **Forward-only.** It reads `supabase_migrations.schema_migrations` first
 *   and applies only versions absent from it. Nothing is re-run, nothing is
 *   reverted, and no schema is reset.
 * - **Never the seed.** `supabase/seed.sql` is local fixture data. It is not
 *   in the migrations directory and this script has no path that reaches it.
 * - **One transaction per migration.** A migration either applies completely
 *   and is recorded, or applies not at all — never half, and never applied
 *   without being recorded.
 * - **Out-of-order versions are surfaced, not hidden.** A migration whose
 *   version precedes an already-applied one is reported explicitly, because
 *   that is a real thing to know about even when the migration is additive
 *   and idempotent.
 *
 * Usage:
 *   node tooling/scripts/supabase-migrate.mjs --project-ref <ref> --plan
 *   node tooling/scripts/supabase-migrate.mjs --project-ref <ref> --apply
 *
 * Requires SUPABASE_ACCESS_TOKEN. `--plan` is the default and writes nothing.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const workspaceDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const MIGRATIONS = path.join(workspaceDirectory, "supabase/migrations");
const API = "https://api.supabase.com";

export function parseMigrationFileName(fileName) {
  const match = fileName.match(/^(\d{14})_(.+)\.sql$/);
  return match ? { version: match[1], name: match[2] } : null;
}

export function localMigrations(directory = MIGRATIONS) {
  return readdirSync(directory)
    .map((fileName) => {
      const identity = parseMigrationFileName(fileName);
      return identity ? { ...identity, fileName } : null;
    })
    .filter((entry) => entry !== null)
    .sort((left, right) => left.version.localeCompare(right.version));
}

/**
 * The migrations to apply, and anything worth knowing about the order.
 *
 * `outOfOrder` is reported separately rather than folded into `pending`: a
 * back-dated migration is safe when it is additive and idempotent, and the
 * operator should be told rather than have it slip through as an ordinary
 * pending entry.
 */
export function planMigrations(local, appliedVersions) {
  const applied = new Set(appliedVersions);
  const highestApplied = appliedVersions.length
    ? [...appliedVersions].sort().at(-1)
    : null;
  const pending = local.filter((entry) => !applied.has(entry.version));
  return {
    pending,
    outOfOrder:
      highestApplied === null
        ? []
        : pending.filter((entry) => entry.version < highestApplied),
    alreadyApplied: local.filter((entry) => applied.has(entry.version)).length,
  };
}

async function query(projectRef, token, sql) {
  const response = await fetch(
    `${API}/v1/projects/${projectRef}/database/query`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    },
  );
  const text = await response.text();
  if (!response.ok) {
    /*
     * The response body can echo the failing statement, which for a migration
     * is exactly what the operator needs. It cannot contain the access token:
     * that only ever travels in a request header.
     */
    throw new Error(
      `SUPABASE_QUERY_FAILED ${response.status}: ${text.slice(0, 900)}`,
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    return [];
  }
}

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  const value = process.argv[index + 1];
  return index === -1 || value === undefined || value.startsWith("--")
    ? null
    : value;
}

async function main() {
  const token = process.env["SUPABASE_ACCESS_TOKEN"];
  if (!token) throw new Error("SUPABASE_ACCESS_TOKEN is required.");
  const projectRef =
    argument("project-ref") ?? process.env["SUPABASE_PROJECT_REF"];
  if (!projectRef) throw new Error("--project-ref is required.");
  const apply = process.argv.includes("--apply");

  const appliedRows = await query(
    projectRef,
    token,
    "select version from supabase_migrations.schema_migrations order by version",
  );
  const appliedVersions = appliedRows.map((row) => String(row.version));
  const local = localMigrations();
  const plan = planMigrations(local, appliedVersions);

  const summary = {
    projectRef,
    mode: apply ? "APPLY" : "PLAN",
    localMigrations: local.length,
    remoteApplied: appliedVersions.length,
    pending: plan.pending.map((entry) => entry.fileName),
    outOfOrder: plan.outOfOrder.map((entry) => entry.fileName),
    applied: [],
  };

  if (apply) {
    for (const entry of plan.pending) {
      const sql = readFileSync(path.join(MIGRATIONS, entry.fileName), "utf8");
      /*
       * The migration and its bookkeeping row commit together. Recording the
       * version in a second call would leave a window where a crash makes an
       * applied migration look pending, and re-running it is only safe for
       * the ones that happen to be idempotent.
       */
      await query(
        projectRef,
        token,
        [
          "begin;",
          sql,
          `insert into supabase_migrations.schema_migrations (version, name) values ('${entry.version}', '${entry.name.replaceAll("'", "''")}') on conflict (version) do nothing;`,
          "commit;",
        ].join("\n"),
      );
      summary.applied.push(entry.fileName);
    }

    const verifyRows = await query(
      projectRef,
      token,
      "select version from supabase_migrations.schema_migrations order by version",
    );
    const verified = new Set(verifyRows.map((row) => String(row.version)));
    const missing = local.filter((entry) => !verified.has(entry.version));
    summary.remoteAppliedAfter = verified.size;
    summary.synchronized = missing.length === 0;
    summary.stillMissing = missing.map((entry) => entry.fileName);
  }

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (apply && summary.synchronized !== true) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1])))
  await main();
