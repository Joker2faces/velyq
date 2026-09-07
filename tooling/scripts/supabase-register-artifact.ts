import { readFileSync } from "node:fs";
import path from "node:path";

import {
  artifactFingerprint,
  COMPETITION_POLICY_VERSION,
  FOOTBALL_COMPETITION_POLICY,
  FOOTBALL_DATA_DIVISIONS,
  type ModelArtifact,
} from "../../packages/research/src/index.js";

/**
 * Registers the trained model artifact and the competition policy into a
 * hosted Supabase project, through the Management API.
 *
 * The artifact belongs in the database rather than in the deployment bundle,
 * and this is the mechanism that gets it there. Two reasons it is not a file:
 * the corpus it derives from has unresolved redistribution terms so the
 * artifact directory is gitignored and never reaches a build, and a model read
 * from the database can be rotated without a redeploy while a prediction that
 * cited an older version still resolves to the row it actually used.
 *
 * Registration is a separate, deliberate step from training. `maturity` is
 * carried across exactly as the trainer decided it — this script has no path
 * that can promote a model — and everything is idempotent by version, so
 * re-running adds nothing and a genuinely new fit gets a new
 * `model_versions` row rather than overwriting one a stored prediction cites.
 *
 * Never regenerates the model. Inference loads what is registered here; a
 * request handler that refitted would make yesterday's prediction
 * irreproducible.
 *
 * Usage:
 *   tsx tooling/scripts/supabase-register-artifact.ts --project-ref <ref> --plan
 *   tsx tooling/scripts/supabase-register-artifact.ts --project-ref <ref> --apply
 */

const API = "https://api.supabase.com";
const MODEL_CODE = "FOOTBALL_DIXON_COLES";
const CALIBRATION_VERSION = "temperature-scaling.v1";

/** Single-quoted SQL literal. */
function literal(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function jsonLiteral(value: unknown): string {
  return `${literal(JSON.stringify(value))}::jsonb`;
}

function argument(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  const value = process.argv[index + 1];
  return index === -1 || value === undefined || value.startsWith("--")
    ? null
    : value;
}

async function query(
  projectRef: string,
  token: string,
  sql: string,
): Promise<readonly Record<string, unknown>[]> {
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
  if (!response.ok)
    throw new Error(
      `SUPABASE_QUERY_FAILED ${response.status}: ${text.slice(0, 900)}`,
    );
  try {
    return JSON.parse(text) as readonly Record<string, unknown>[];
  } catch {
    return [];
  }
}

/**
 * The whole registration as one idempotent statement.
 *
 * A single transaction rather than a sequence of calls: a half-registered
 * model — a version row with no artifact, say — is a state the prediction
 * cycle would load and then fail on, and it is easier to make impossible than
 * to detect.
 */
export function buildRegistrationSql(
  artifact: ModelArtifact,
  artifactReference: string,
  ensembleSummary: unknown | null,
): string {
  const statements: string[] = ["begin;"];

  statements.push(`
with definition as (
  select id from intelligence.model_definitions where code = ${literal(MODEL_CODE)}
), version as (
  insert into intelligence.model_versions (
    model_definition_id, version, maturity_status, validation_status,
    feature_contract_version, artifact_reference
  )
  select d.id, ${literal(artifact.version)}, ${literal(artifact.maturity)},
         'BACKTESTED_NOT_FORWARD_TESTED',
         ${literal(artifact.featureContractVersion)}, ${literal(artifactReference)}
  from definition d
  on conflict (model_definition_id, version) do nothing
  returning id
), resolved as (
  select id from version
  union all
  select mv.id from intelligence.model_versions mv, definition d
  where mv.model_definition_id = d.id and mv.version = ${literal(artifact.version)}
  limit 1
), calibration as (
  insert into intelligence.calibration_versions (
    model_version_id, version, method, parameters, validation_status
  )
  select r.id, ${literal(CALIBRATION_VERSION)}, 'TEMPERATURE_SCALING',
         ${jsonLiteral({ markets: artifact.calibrators, ensemble: ensembleSummary })},
         'FITTED_ON_WALK_FORWARD_VALIDATION'
  from resolved r
  on conflict (model_version_id, version) do nothing
  returning id
)
insert into intelligence.model_artifacts (
  model_version_id, artifact_reference, training_dataset_fingerprint,
  training_cutoff, parameters, calibrators, uncertainty_profiles,
  validation_report
)
select r.id, ${literal(artifactReference)},
       ${literal(artifact.trainingDatasetFingerprint)},
       ${literal(`${artifact.trainingCutoff}T00:00:00Z`)}::timestamptz,
       ${jsonLiteral(artifact.parameters)},
       ${jsonLiteral(artifact.calibrators)},
       ${jsonLiteral(artifact.uncertaintyProfiles)},
       ${jsonLiteral(artifact.validationReport)}
from resolved r
on conflict (artifact_reference) do nothing;`);

  /*
   * The competition policy is materialised from the code constant, which
   * stays the single source of truth. A policy that lives only in rows can be
   * edited into a state no reviewer saw; one that lives only in code cannot
   * be joined against an event.
   */
  statements.push(`
insert into catalog.competition_policy_versions (version, definition, effective_from)
values (
  ${literal(COMPETITION_POLICY_VERSION)},
  ${jsonLiteral({
    source: "@velyq/research FOOTBALL_COMPETITION_POLICY",
    entries: FOOTBALL_COMPETITION_POLICY.length,
  })},
  now()
)
on conflict (version) do nothing;`);

  for (const entry of FOOTBALL_COMPETITION_POLICY) {
    statements.push(`
insert into catalog.competition_policies (
  policy_version_id, sport_id, canonical_code, display_name, country_code,
  tier, state, model_eligible, customer_visible, min_historical_sample,
  min_bookmaker_coverage, manual_override, override_reason, reason_codes
)
select v.id, s.id, ${literal(entry.canonicalCode)}, ${literal(entry.displayName)},
       ${literal(entry.countryCode.slice(0, 2))}, ${entry.tier},
       ${literal(entry.state)}, ${entry.modelEligible}, ${entry.customerVisible},
       ${entry.minHistoricalSample}, ${entry.minBookmakerCoverage},
       null, null, ${literal(`{${entry.reasonCodes.join(",")}}`)}::text[]
from catalog.competition_policy_versions v, catalog.sports s
where v.version = ${literal(COMPETITION_POLICY_VERSION)} and s.code = 'FOOTBALL'
on conflict (policy_version_id, canonical_code) do nothing;`);
  }

  /*
   * Football-Data's division codes, which are already unambiguous. The
   * API-Sports identities are written by the coverage sync instead, keyed on
   * the provider's league id, because a fixture's league *name* is not an
   * identity.
   */
  for (const [division, canonicalCode] of Object.entries(
    FOOTBALL_DATA_DIVISIONS,
  )) {
    const countryCode =
      FOOTBALL_COMPETITION_POLICY.find(
        (entry) => entry.canonicalCode === canonicalCode,
      )?.countryCode.slice(0, 2) ?? null;
    statements.push(`
insert into catalog.competition_identities (
  canonical_code, source_code, source_key, source_name, country_code
)
values (
  ${literal(canonicalCode)}, 'FOOTBALL_DATA_UK', ${literal(division)},
  ${literal(division)}, ${countryCode === null ? "null" : literal(countryCode)}
)
on conflict (source_code, source_key) do nothing;`);
  }

  statements.push("commit;");
  return statements.join("\n");
}

async function main() {
  const token = process.env["SUPABASE_ACCESS_TOKEN"];
  if (!token) throw new Error("SUPABASE_ACCESS_TOKEN is required.");
  const projectRef =
    argument("project-ref") ?? process.env["SUPABASE_PROJECT_REF"];
  if (!projectRef) throw new Error("--project-ref is required.");
  const apply = process.argv.includes("--apply");

  const artifactDirectory =
    process.env["VELYQ_MODEL_ARTIFACT_DIR"] ?? "data/historical/artifacts";
  const artifact = JSON.parse(
    readFileSync(
      path.join(artifactDirectory, "football-dixon-coles.v1.json"),
      "utf8",
    ),
  ) as ModelArtifact;
  const artifactReference = artifactFingerprint(artifact);

  /*
   * The ensemble verdict rides along in the calibration parameters rather
   * than as its own model version. It is not an independent outcome model —
   * its own walk-forward says it matches the market — so registering it as a
   * peer of the score model would overstate what it is.
   */
  let ensembleSummary: unknown;
  try {
    ensembleSummary = JSON.parse(
      readFileSync(
        path.join(artifactDirectory, "football-market-ensemble.v1.json"),
        "utf8",
      ),
    );
  } catch {
    ensembleSummary = null;
  }

  const sql = buildRegistrationSql(
    artifact,
    artifactReference,
    ensembleSummary,
  );
  const summary: Record<string, unknown> = {
    projectRef,
    mode: apply ? "APPLY" : "PLAN",
    modelCode: artifact.modelCode,
    version: artifact.version,
    maturity: artifact.maturity,
    trainingCutoff: artifact.trainingCutoff,
    trainingDatasetFingerprint: artifact.trainingDatasetFingerprint,
    artifactReference,
    competitionPolicies: FOOTBALL_COMPETITION_POLICY.length,
    ensembleVerdict:
      (ensembleSummary as { verdict?: string } | null)?.verdict ?? null,
    statementBytes: sql.length,
  };

  if (apply) {
    await query(projectRef, token, sql);
    const verified = await query(
      projectRef,
      token,
      `select
         (select count(*) from intelligence.model_versions where version = ${literal(artifact.version)}) as model_versions,
         (select count(*) from intelligence.model_artifacts where artifact_reference = ${literal(artifactReference)}) as artifacts,
         (select count(*) from catalog.competition_policies) as policies,
         (select count(*) from catalog.competition_identities) as identities,
         (select maturity_status from intelligence.model_versions where version = ${literal(artifact.version)} limit 1) as maturity`,
    );
    summary["verified"] = verified[0] ?? null;
  }

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

if (process.argv[1]?.endsWith("supabase-register-artifact.ts")) void main();
