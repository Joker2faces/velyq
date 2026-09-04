import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

const ownerId = process.env.VELYQ_OWNER_USER_ID;
const expectedProjectRef = process.env.VELYQ_EXPECTED_PROJECT_REF;
if (
  !ownerId ||
  !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    ownerId,
  )
) {
  throw new Error("Set VELYQ_OWNER_USER_ID to an existing auth.users UUID.");
}
if (!expectedProjectRef || !/^[a-z0-9]{20}$/i.test(expectedProjectRef)) {
  throw new Error(
    "Set VELYQ_EXPECTED_PROJECT_REF to the intended linked Supabase project ref.",
  );
}

const seed = readFileSync(resolve("supabase/seed.sql"), "utf8");
const statements = seed
  .split(/;\s*(?=INSERT INTO )/)
  .map((statement) => statement.trim())
  .filter(Boolean)
  .filter(
    (statement) =>
      !/^(?:\s*--[^\r\n]*(?:\r?\n|$))*\s*INSERT INTO auth\.users\b/i.test(
        statement,
      ),
  )
  .map((statement) => {
    if (/^INSERT INTO public\.profiles\b/i.test(statement)) {
      return `INSERT INTO public.profiles (user_id, display_name, locale, timezone, created_at, updated_at)
VALUES ('${ownerId}', 'VELYQ Owner', 'en', 'UTC', '2026-09-04T00:00:00Z', '2026-09-04T00:00:00Z')
ON CONFLICT (user_id) DO UPDATE SET display_name = EXCLUDED.display_name, updated_at = EXCLUDED.updated_at`;
    }
    if (/^INSERT INTO private\.user_roles\b/i.test(statement)) {
      return `INSERT INTO private.user_roles (user_id, role_id, granted_by, granted_at)
SELECT '${ownerId}'::uuid, r.id, '${ownerId}'::uuid, '2026-09-04T00:00:00Z'
FROM private.roles r
WHERE r.code IN ('USER', 'ADMIN')
ON CONFLICT (user_id, role_id) DO NOTHING`;
    }
    return statement.replaceAll(
      "00000000-0000-4000-8000-000000000003",
      ownerId,
    );
  });

const corepackJs = resolve(
  dirname(process.execPath),
  "node_modules/corepack/dist/corepack.js",
);
const runCli = (args, options = {}) =>
  execFileSync(
    process.execPath,
    [corepackJs, "pnpm", "exec", "supabase", ...args],
    {
      cwd: resolve("."),
      encoding: "utf8",
      windowsHide: true,
      ...options,
    },
  );
const projectList = runCli(["projects", "list", "--output", "json"]);
const projects = JSON.parse(projectList);
if (
  !projects.some(
    (project) => project.ref === expectedProjectRef && project.linked === true,
  )
) {
  throw new Error(
    `Expected linked Supabase project ${expectedProjectRef} was not confirmed.`,
  );
}
const tempDirectory = mkdtempSync(resolve(tmpdir(), "velyq-staging-seed-"));
try {
  const preflightPath = resolve(tempDirectory, "preflight.sql");
  writeFileSync(
    preflightPath,
    `SELECT
      (SELECT count(*) FROM public.profiles) AS profiles,
      (SELECT count(*) FROM private.roles) AS roles,
      (SELECT count(*) FROM private.permissions) AS permissions,
      (SELECT count(*) FROM private.role_permissions) AS role_permissions,
      (SELECT count(*) FROM private.user_roles) AS user_roles,
      (SELECT count(*) FROM catalog.sports) AS sports,
      (SELECT count(*) FROM catalog.competitions) AS competitions,
      (SELECT count(*) FROM catalog.participants) AS participants,
      (SELECT count(*) FROM catalog.events) AS events,
      (SELECT count(*) FROM catalog.event_participants) AS event_participants,
      (SELECT count(*) FROM operations.providers) AS providers,
      (SELECT count(*) FROM operations.provider_policy_versions) AS provider_policy_versions,
      (SELECT count(*) FROM operations.provider_sync_runs) AS provider_sync_runs,
      (SELECT count(*) FROM operations.source_observations) AS source_observations,
      (SELECT count(*) FROM operations.jobs) AS jobs,
      (SELECT count(*) FROM market.market_definitions) AS market_definitions,
      (SELECT count(*) FROM market.outcome_definitions) AS outcome_definitions,
      (SELECT count(*) FROM market.provider_market_mappings) AS provider_market_mappings,
      (SELECT count(*) FROM market.event_markets) AS event_markets,
      (SELECT count(*) FROM market.event_market_outcomes) AS event_market_outcomes,
      (SELECT count(*) FROM market.bookmakers) AS bookmakers,
      (SELECT count(*) FROM market.odds_observations) AS odds_observations,
      (SELECT count(*) FROM intelligence.lineup_observations) AS lineup_observations,
      (SELECT count(*) FROM intelligence.data_quality_policy_versions) AS data_quality_policy_versions,
      (SELECT count(*) FROM intelligence.data_quality_assessments) AS data_quality_assessments,
      (SELECT count(*) FROM intelligence.model_definitions) AS model_definitions,
      (SELECT count(*) FROM intelligence.model_versions) AS model_versions,
      (SELECT count(*) FROM intelligence.calibration_versions) AS calibration_versions,
      (SELECT count(*) FROM intelligence.prediction_runs) AS prediction_runs,
      (SELECT count(*) FROM intelligence.predictions) AS predictions,
      (SELECT count(*) FROM intelligence.prediction_inputs) AS prediction_inputs,
      (SELECT count(*) FROM intelligence.score_definition_versions) AS score_definition_versions,
      (SELECT count(*) FROM intelligence.score_results) AS score_results,
      (SELECT count(*) FROM intelligence.radar_evidence) AS radar_evidence,
      (SELECT count(*) FROM audit.admin_audit_events) AS audit_events;\n`,
    "utf8",
  );
  const preflight = runCli([
    "db",
    "query",
    "--linked",
    "--output-format",
    "json",
    "--file",
    preflightPath,
  ]);
  for (const sentinel of [
    "profiles",
    "roles",
    "permissions",
    "role_permissions",
    "user_roles",
    "sports",
    "competitions",
    "participants",
    "events",
    "event_participants",
    "providers",
    "provider_policy_versions",
    "provider_sync_runs",
    "source_observations",
    "jobs",
    "market_definitions",
    "outcome_definitions",
    "provider_market_mappings",
    "event_markets",
    "event_market_outcomes",
    "bookmakers",
    "odds_observations",
    "lineup_observations",
    "data_quality_policy_versions",
    "data_quality_assessments",
    "model_definitions",
    "model_versions",
    "calibration_versions",
    "prediction_runs",
    "predictions",
    "prediction_inputs",
    "score_definition_versions",
    "score_results",
    "radar_evidence",
    "audit_events",
  ]) {
    if (!new RegExp(`\"${sentinel}\"\\s*:\\s*0\\b`).test(preflight)) {
      throw new Error(
        `Refusing to run staging seed: ${sentinel} is not empty.`,
      );
    }
  }
  const seedPath = resolve(tempDirectory, "seed.sql");
  writeFileSync(
    seedPath,
    `BEGIN;\n${statements.map((statement) => `${statement};`).join("\n")}\nCOMMIT;\n`,
    "utf8",
  );
  process.stdout.write(
    `Applying atomic staging seed (${statements.length} statements)...\n`,
  );
  runCli(["db", "query", "--linked", "--file", seedPath], {
    stdio: "inherit",
  });
} finally {
  rmSync(tempDirectory, { recursive: true, force: true });
}

process.stdout.write(
  "Remote staging seed complete; no auth.users rows were inserted.\n",
);
