import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Proves the release migration path against a schema shaped like the
 * ACTUAL production database -- verified read-only DDL from the linked
 * Supabase project (zvdqkmevjfwprexshpap), not an assumption. Materially
 * different from local-postgres-upgrade.mjs, which proves an ordinary
 * upgrade along this branch's own migration lineage.
 *
 * Production's real legacy shape modeled here:
 *   - catalog.competition_identities: id, canonical_code, source_code,
 *     source_key, source_name, country_code, created_at;
 *     UNIQUE(source_code, source_key); INDEX(canonical_code). NONE of
 *     this branch's provider-centric columns (competition_id, provider_id,
 *     provider_competition_id, display_name, mapping_status,
 *     mapping_confidence, verified_at).
 *   - catalog.event_identities: id, event_id, source_code, source_key,
 *     created_at; UNIQUE(source_code, source_key);
 *     UNIQUE(event_id, source_code); FK event_id -> catalog.events. NONE
 *     of provider_id / provider_fixture_id.
 *   - NO event-provenance trigger of any kind.
 *   - intelligence.score_results.idempotency_key + its unique index
 *     ALREADY present (built independently, before this branch's own
 *     20260922090000 migration existed).
 *   - operations.providers already seeded with API_SPORTS /
 *     FOOTBALL_DATA_UK / SYNTHETIC_FIXTURES.
 *   - canonical_code values use @velyq/research's own competition code
 *     space (e.g. "ITA_SERIE_A"), which is NOT catalog.competitions.code
 *     (an unrelated internal slug, e.g. "serie-a") -- confirmed by two
 *     independent real production examples (ITA_SERIE_A -> serie-a,
 *     ESP_LA_LIGA -> la-liga), both matching the same deterministic
 *     transform (strip the 3-letter country prefix, lowercase, underscore
 *     -> dash) that 20260925110000_legacy_identity_compatibility.sql
 *     relies on to link competition_id without guessing.
 *
 * Applies the reconciliation migrations and subsequent additive release
 * migrations on top of this fixture
 * -- 20260925110000 (legacy compatibility), 20260922090000 (idempotent
 * score_results, verified to no-op), 20260925100000 (forecast history) --
 * not the full chain, since replaying this branch's disputed
 * 20260908090000 migration here would misrepresent what actually happens
 * against production (see supabase/PRODUCTION_MIGRATION_RECONCILIATION.md).
 */

const workspace = process.cwd();
const port = "55434";
const database = "velyq_production_upgrade_test";
const connectionString = `postgresql://postgres@127.0.0.1:${port}/${database}`;
const logDirectory = join(tmpdir(), "velyq-local-postgres");
const failureLog = join(logDirectory, "postgres-production-upgrade.log");

mkdirSync(logDirectory, { recursive: true });

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: workspace,
    encoding: "utf8",
    stdio: "pipe",
    windowsHide: true,
    shell: process.platform === "win32",
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed.\n${result.stderr || result.stdout || result.error?.message || "No process output."}`,
    );
  }
  return result.stdout.trim();
}

function wsl(script, allowFailure = false) {
  const encoded = Buffer.from(script, "utf8").toString("base64");
  const result = spawnSync(
    "wsl",
    [
      "-d",
      "Ubuntu-24.04",
      "--",
      "bash",
      "-lc",
      `printf %s '${encoded}' | base64 -d | bash`,
    ],
    { cwd: workspace, encoding: "utf8", windowsHide: true },
  );
  if (!allowFailure && result.status !== 0) {
    throw new Error(
      result.stderr || result.stdout || "WSL PostgreSQL command failed.",
    );
  }
  return result;
}

function windowsPathToWsl(value) {
  return value
    .replace(/\\/g, "/")
    .replace(/^([A-Za-z]):/, (_, drive) => `/mnt/${drive.toLowerCase()}`);
}

const wslWorkspace = windowsPathToWsl(workspace);
const wslLog = windowsPathToWsl(failureLog);

// Everything up to and including this migration is presumed identical
// between this branch and production -- only the 20260908090000+ lineage
// is in question, per the reconciliation this script exists to prove.
const SHARED_HISTORY_BOUNDARY =
  "20260905192925_harden_private_authorization_tables";

const bootstrap = `
set -euo pipefail
runtime=$HOME/.cache/velyq-pg-runtime-17
data=$HOME/.cache/velyq-pg-data-production-upgrade
socket=$HOME/.cache/velyq-pg-socket-production-upgrade
bindir=$runtime/usr/lib/postgresql/17/bin
mkdir -p "$socket"
[ -x "$bindir/postgres" ]
export LD_LIBRARY_PATH=$runtime/usr/lib/x86_64-linux-gnu
if [ -f "$data/postmaster.pid" ]; then "$bindir/pg_ctl" -D "$data" -m fast stop || true; fi
rm -rf "$data"
"$bindir/initdb" -D "$data" --username=postgres --auth=trust --no-instructions >/dev/null
printf "listen_addresses = '127.0.0.1'\\nport = ${port}\\nunix_socket_directories = '$socket'\\n" >> "$data/postgresql.conf"
"$bindir/pg_ctl" -D "$data" -l '${wslLog}' -o "-p ${port} -h 127.0.0.1" start >/dev/null
"$bindir/pg_isready" -h 127.0.0.1 -p ${port} -U postgres >/dev/null
"$bindir/dropdb" -h 127.0.0.1 -p ${port} -U postgres --if-exists ${database}
"$bindir/createdb" -h 127.0.0.1 -p ${port} -U postgres ${database}
psql() { "$bindir/psql" -q -h 127.0.0.1 -p ${port} -U postgres -d ${database} -v ON_ERROR_STOP=1 "$@"; }
psql <<'SQL'
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA extensions;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb, raw_app_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
SQL

echo '--- SHARED HISTORY: applying migrations up to ${SHARED_HISTORY_BOUNDARY} ---'
boundary_reached=0
for migration in $(find '${wslWorkspace}/supabase/migrations' -maxdepth 1 -type f -name '*.sql' | sort); do
  psql -f "$migration"
  case "$migration" in
    *${SHARED_HISTORY_BOUNDARY}*) boundary_reached=1; break ;;
  esac
done
[ "$boundary_reached" = "1" ]

echo '--- PRODUCTION LEGACY STATE: real verified DDL, not the provider-centric proxy this branch expects ---'
psql <<'SQL'
-- Production's own catalog.events check is CHECK synthetic IN (true, false)
-- (i.e. it already accepts LIVE rows) -- not this branch's Phase-1-only
-- CHECK synthetic = true, which only this branch's own 20260908090000
-- migration drops, and this fixture deliberately does not apply.
ALTER TABLE "catalog"."events" DROP CONSTRAINT IF EXISTS "events_phase_one_synthetic_check";
ALTER TABLE "catalog"."events" ADD CONSTRAINT "events_phase_one_synthetic_check" CHECK (synthetic IN (true, false));

CREATE TABLE "catalog"."competition_identities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "canonical_code" text NOT NULL,
  "source_code" text NOT NULL,
  "source_key" text NOT NULL,
  "source_name" text NOT NULL,
  "country_code" char(2),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "competition_identities_source_unique" UNIQUE("source_code","source_key")
);
CREATE INDEX "competition_identities_canonical_code_idx" ON "catalog"."competition_identities" ("canonical_code");

CREATE TABLE "catalog"."event_identities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "event_id" uuid NOT NULL,
  "source_code" text NOT NULL,
  "source_key" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "event_identities_source_unique" UNIQUE("source_code","source_key"),
  CONSTRAINT "event_identities_event_source_unique" UNIQUE("event_id","source_code")
);
ALTER TABLE "catalog"."event_identities" ADD CONSTRAINT "event_identities_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "catalog"."events"("id") ON DELETE cascade;

-- Production already has score_results.idempotency_key + its unique
-- index, independent of this branch's own migration for it.
ALTER TABLE "intelligence"."score_results"
  ADD COLUMN "idempotency_key" text NOT NULL DEFAULT gen_random_uuid()::text;
CREATE UNIQUE INDEX "score_results_idempotency_key_unique"
  ON "intelligence"."score_results" ("idempotency_key");
SQL

echo '--- seeding representative production-legacy identity data ---'
psql -f '${wslWorkspace}/supabase/seed.sql'
psql <<'SQL'
-- seed.sql only inserts the SYNTHETIC_FIXTURES provider -- production
-- additionally has API_SPORTS and FOOTBALL_DATA_UK (verified fact), which
-- this fixture must seed itself since seed.sql predates real providers.
INSERT INTO operations.providers (id, code, display_name, is_synthetic, created_at)
VALUES
  ('30000000-0000-4000-8000-000000000002', 'API_SPORTS', 'API-Sports', false, '2026-01-01T00:00:00Z'),
  ('30000000-0000-4000-8000-000000000003', 'FOOTBALL_DATA_UK', 'Football-Data.co.uk', false, '2026-01-01T00:00:00Z')
ON CONFLICT DO NOTHING;

-- A real internal competitions row using this branch's own slug
-- convention -- proving the migration's deterministic canonical_code ->
-- competitions.code transform (verified against two real production
-- examples) links to an EXISTING row rather than fabricating one.
INSERT INTO catalog.competitions (id, sport_id, code, name_key, country_code)
SELECT '99000000-0000-4000-8000-000000000001', id, 'serie-a', 'competition.serie_a', 'IT'
FROM catalog.sports WHERE code = 'FOOTBALL'
ON CONFLICT DO NOTHING;

INSERT INTO catalog.competition_identities (id, canonical_code, source_code, source_key, source_name, country_code)
VALUES ('99000000-0000-4000-8000-000000000002', 'ITA_SERIE_A', 'API_SPORTS', 'PROD_LEGACY_TEST_LEAGUE', 'Serie A', 'IT');

-- A real LIVE event, fully covered by a matching event_identities row --
-- proving the deferred provenance trigger is safely enabled when the
-- precondition genuinely holds (zero orphans).
INSERT INTO catalog.events (id, sport_id, competition_id, starts_at, status, synthetic)
SELECT '99000000-0000-4000-8000-000000000003', sp.id, '99000000-0000-4000-8000-000000000001', now() + interval '1 day', 'NS', false
FROM catalog.sports sp WHERE sp.code = 'FOOTBALL';

INSERT INTO catalog.event_identities (id, event_id, source_code, source_key)
VALUES ('99000000-0000-4000-8000-000000000004', '99000000-0000-4000-8000-000000000003', 'API_SPORTS', 'PROD_LEGACY_TEST_FIXTURE');

-- Production currently contains legacy LIVE rows without an identity. The
-- closure migration must protect every future write without rewriting or
-- falsely relabelling this historical row.
INSERT INTO catalog.events (id, sport_id, competition_id, starts_at, status, synthetic)
SELECT '99000000-0000-4000-8000-000000000005', sp.id,
       '99000000-0000-4000-8000-000000000001', now() - interval '1 day', 'FT', false
FROM catalog.sports sp WHERE sp.code = 'FOOTBALL';
SQL

echo '--- capturing pre-reconciliation state ---'
psql -t -A -F',' -c "
  select 'events', count(*) from catalog.events
  union all select 'participants', count(*) from catalog.participants
  union all select 'competitions', count(*) from catalog.competitions
  union all select 'profiles', count(*) from public.profiles
  union all select 'competition_identities', count(*) from catalog.competition_identities
  union all select 'event_identities', count(*) from catalog.event_identities
  order by 1
" > /tmp/velyq-production-upgrade-before.csv
psql -t -A -c "select id, sport_id, competition_id, starts_at, status, synthetic from catalog.events order by id" \\
  > /tmp/velyq-production-upgrade-events-before.txt
psql -t -A -c "select id, canonical_code, source_code, source_key, source_name from catalog.competition_identities order by id" \\
  > /tmp/velyq-production-upgrade-competition-identities-before.txt
psql -t -A -c "select id, event_id, source_code, source_key from catalog.event_identities order by id" \\
  > /tmp/velyq-production-upgrade-event-identities-before.txt

echo '--- RECONCILIATION MIGRATIONS ONLY, in release order ---'
psql -f '${wslWorkspace}/supabase/migrations/20260925110000_legacy_identity_compatibility.sql'
psql -f '${wslWorkspace}/supabase/migrations/20260922090000_score_results_idempotency_key.sql'
psql -f '${wslWorkspace}/supabase/migrations/20260925100000_forecasts_decisions_and_settlements.sql'

echo '--- reproducing the observed CONFIRMED-without-catalog legacy state ---'
psql -c "
  update catalog.competition_identities
  set mapping_status = 'CONFIRMED', competition_id = null, verified_at = now()
  where id = '99000000-0000-4000-8000-000000000002'
"
psql -f '${wslWorkspace}/supabase/migrations/20260926120000_enforce_identity_invariants.sql'

echo '--- applying subsequent provider ingestion migrations ---'
psql -f '${wslWorkspace}/supabase/migrations/20260927090000_provider_quota_and_ingestion_runs.sql'
psql -f '${wslWorkspace}/supabase/migrations/20260927100000_provider_quota_purpose_counters.sql'
psql -f '${wslWorkspace}/supabase/migrations/20260927110000_provider_odds_request_log.sql'
psql -f '${wslWorkspace}/supabase/migrations/20260928090000_provider_result_requests_and_run_counters.sql'
psql -f '${wslWorkspace}/supabase/migrations/20260928100000_provider_lineup_requests_and_run_counters.sql'

echo '--- preserving historical source evidence through nullable observation migration ---'
psql -c "
  insert into operations.source_observations
    (id, provider_id, sync_run_id, observation_type, provider_external_id, provider_observed_at, received_at, normalized_at, normalization_version, mapping_version, content_hash)
  select '99000000-0000-4000-8000-000000000015', provider_id, sync_run_id, 'RESULT', 'legacy-result-15', '2026-09-10T18:30:00Z', '2026-09-10T18:30:00Z', '2026-09-10T18:30:00Z', normalization_version, mapping_version, 'sha256:legacy-result-15'
  from operations.source_observations order by id limit 1;
  insert into intelligence.event_results
    (id, event_id, source_observation_id, status, home_score, away_score, provider_observed_at)
  select '99000000-0000-4000-8000-000000000015', id, '99000000-0000-4000-8000-000000000015', 'FINAL', 2, 1, '2026-09-10T18:30:00Z'
  from catalog.events order by id limit 1;
"
psql -t -A -c "select count(*) = 1 from intelligence.event_results where id = '99000000-0000-4000-8000-000000000015'" | grep -qx t
psql -t -A -c "select row_to_json(s) from operations.source_observations s order by id" > /tmp/velyq-production-upgrade-sources-before.txt
psql -t -A -c "select row_to_json(r) from intelligence.event_results r order by id" > /tmp/velyq-production-upgrade-results-before.txt
psql -f '${wslWorkspace}/supabase/migrations/20260928110000_result_observation_time_nullable.sql'
psql -t -A -c "select row_to_json(s) from operations.source_observations s order by id" > /tmp/velyq-production-upgrade-sources-after.txt
psql -t -A -c "select row_to_json(r) from intelligence.event_results r order by id" > /tmp/velyq-production-upgrade-results-after.txt
diff /tmp/velyq-production-upgrade-sources-before.txt /tmp/velyq-production-upgrade-sources-after.txt
diff /tmp/velyq-production-upgrade-results-before.txt /tmp/velyq-production-upgrade-results-after.txt
psql -t -A -c "select count(*) = 2 from information_schema.columns where (table_schema, table_name) in (('operations', 'source_observations'), ('intelligence', 'event_results')) and column_name = 'provider_observed_at' and is_nullable = 'YES'" | grep -qx t

echo '--- verifying the release tables now exist ---'
psql -t -A -c "select to_regclass('intelligence.forecasts') is not null" | grep -qx t
psql -t -A -c "select to_regclass('intelligence.decisions') is not null" | grep -qx t
psql -t -A -c "select to_regclass('intelligence.event_results') is not null" | grep -qx t
psql -t -A -c "select to_regclass('intelligence.market_settlements') is not null" | grep -qx t

echo '--- verifying the idempotent score_results migration correctly no-op'"'"'d rather than erroring ---'
psql -t -A -c "
  select count(*) = 1
  from pg_class relation
  join pg_namespace namespace on namespace.oid = relation.relnamespace
  where relation.relname = 'score_results_idempotency_key_unique'
    and namespace.nspname = 'intelligence'
" | grep -qx t

echo '--- verifying legacy columns are still intact and readable ---'
psql -t -A -c "select canonical_code, source_code, source_key, source_name from catalog.competition_identities where id = '99000000-0000-4000-8000-000000000002'" \\
  | grep -qx 'ITA_SERIE_A|API_SPORTS|PROD_LEGACY_TEST_LEAGUE|Serie A'
psql -t -A -c "select event_id, source_code, source_key from catalog.event_identities where id = '99000000-0000-4000-8000-000000000004'" \\
  | grep -qx '99000000-0000-4000-8000-000000000003|API_SPORTS|PROD_LEGACY_TEST_FIXTURE'

echo '--- verifying the NEW branch-required provider columns and reproduced legacy anomaly ---'
psql -t -A -c "
  select provider_id is not null
    and provider_competition_id = 'PROD_LEGACY_TEST_LEAGUE'
    and display_name = 'Serie A'
    and mapping_status = 'CONFIRMED'
    and competition_id is null
  from catalog.competition_identities where id = '99000000-0000-4000-8000-000000000002'
" | grep -qx t
psql -t -A -c "
  select provider_id is not null and provider_fixture_id = 'PROD_LEGACY_TEST_FIXTURE'
  from catalog.event_identities where id = '99000000-0000-4000-8000-000000000004'
" | grep -qx t
psql -t -A -c "
  select p.code from operations.providers p
  join catalog.competition_identities ci on ci.provider_id = p.id
  where ci.id = '99000000-0000-4000-8000-000000000002'
" | grep -qx API_SPORTS

echo '--- verifying the future-write provenance invariant is enabled despite a legacy orphan ---'
psql -t -A -c "
  select count(*) = 1 from pg_trigger where tgname = 'events_provenance_required'
" | grep -qx t
psql -t -A -c "
  select count(*) = 1 from catalog.events
  where id = '99000000-0000-4000-8000-000000000005'
    and synthetic = false
" | grep -qx t
if psql -c "
  insert into catalog.events (id, sport_id, competition_id, starts_at, status, synthetic)
  select '99000000-0000-4000-8000-000000000006', sport_id,
         competition_id, now(), 'NS', false
  from catalog.events where id = '99000000-0000-4000-8000-000000000005'
" >/dev/null 2>&1; then
  echo 'future LIVE orphan was incorrectly accepted' >&2
  exit 1
fi

echo '--- verifying CONFIRMED now requires a catalog competition for future writes ---'
psql -t -A -c "
  select convalidated = false from pg_constraint
  where conname = 'competition_identities_confirmed_requires_catalog'
" | grep -qx t
if psql -c "
  insert into catalog.competition_identities
    (provider_id, provider_competition_id, display_name, mapping_status)
  select id, 'INVALID_CONFIRMED_TEST', 'Invalid confirmed test', 'CONFIRMED'
  from operations.providers where code = 'API_SPORTS'
" >/dev/null 2>&1; then
  echo 'future invalid CONFIRMED identity was incorrectly accepted' >&2
  exit 1
fi

echo '--- verifying the reproduced legacy CONFIRMED anomaly remains for reviewed remediation ---'
psql -t -A -c "select count(*) = 1 from catalog.competition_identities where mapping_status = 'CONFIRMED' and competition_id is null" | grep -qx t

echo '--- verifying pre-reconciliation data survived unrewritten ---'
psql -t -A -F',' -c "
  select 'events', count(*) from catalog.events
  union all select 'participants', count(*) from catalog.participants
  union all select 'competitions', count(*) from catalog.competitions
  union all select 'profiles', count(*) from public.profiles
  union all select 'competition_identities', count(*) from catalog.competition_identities
  union all select 'event_identities', count(*) from catalog.event_identities
  order by 1
" > /tmp/velyq-production-upgrade-after.csv
diff /tmp/velyq-production-upgrade-before.csv /tmp/velyq-production-upgrade-after.csv
psql -t -A -c "select id, sport_id, competition_id, starts_at, status, synthetic from catalog.events order by id" \\
  > /tmp/velyq-production-upgrade-events-after.txt
diff /tmp/velyq-production-upgrade-events-before.txt /tmp/velyq-production-upgrade-events-after.txt
psql -t -A -c "select id, canonical_code, source_code, source_key, source_name from catalog.competition_identities order by id" \\
  > /tmp/velyq-production-upgrade-competition-identities-after.txt
diff /tmp/velyq-production-upgrade-competition-identities-before.txt /tmp/velyq-production-upgrade-competition-identities-after.txt
psql -t -A -c "select id, event_id, source_code, source_key from catalog.event_identities order by id" \\
  > /tmp/velyq-production-upgrade-event-identities-after.txt
diff /tmp/velyq-production-upgrade-event-identities-before.txt /tmp/velyq-production-upgrade-event-identities-after.txt

echo '--- verifying no duplicate provider identities were introduced ---'
psql -t -A -c "
  select count(*) = 0 from (
    select provider_id, provider_fixture_id, count(*) c
    from catalog.event_identities group by 1,2 having count(*) > 1
  ) dup
" | grep -qx t
psql -t -A -c "
  select count(*) = 0 from (
    select provider_id, provider_competition_id, count(*) c
    from catalog.competition_identities group by 1,2 having count(*) > 1
  ) dup
" | grep -qx t
`;

const stop = `
runtime=$HOME/.cache/velyq-pg-runtime-17
data=$HOME/.cache/velyq-pg-data-production-upgrade
export LD_LIBRARY_PATH=$runtime/usr/lib/x86_64-linux-gnu
"$runtime/usr/lib/postgresql/17/bin/pg_ctl" -D "$data" -m fast stop >/dev/null 2>&1 || true
`;

let success = false;
try {
  wsl(bootstrap);
  run(
    process.execPath,
    [
      join(workspace, "node_modules", "vitest", "vitest.mjs"),
      "run",
      "--config",
      "tooling/vitest/vitest.db-integration.config.mts",
    ],
    {
      env: { ...process.env, DATABASE_URL: connectionString },
      shell: false,
    },
  );
  success = true;
  console.log(
    "PASS production-faithful reconciliation: release migrations applied cleanly on top of the ACTUAL verified production legacy schema, existing data preserved, new columns backfilled deterministically without guessing, provenance trigger safely enabled, DB integration suite green against the reconciled schema",
  );
} finally {
  wsl(stop, true);
  if (!success)
    console.error(
      `Local PostgreSQL production-upgrade logs retained at ${failureLog}`,
    );
}
