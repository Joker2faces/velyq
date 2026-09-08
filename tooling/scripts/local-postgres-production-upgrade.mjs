import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Proves the release migration path against a schema shaped like the
 * ACTUAL production database, not just this branch's own migration
 * history -- a materially different scenario from
 * local-postgres-upgrade.mjs, which proves an ordinary upgrade along this
 * branch's own lineage. This one models a real, observed divergence:
 *
 *   - Production independently built the equivalent of
 *     catalog.competition_identities / catalog.event_identities / the
 *     deferred event-provenance trigger under a DIFFERENT migration
 *     lineage than this branch's 20260908090000_provider_identity_and_
 *     live_data.sql -- production's own migration history records a
 *     DIFFERENT migration at that same version number
 *     ("research_corpus_and_intelligence_policy"), and a later one named
 *     "event_identities". Because Supabase's migration runner tracks
 *     applied versions (and their checksums) rather than diffing DDL
 *     content, this branch's colliding 20260908090000 migration cannot
 *     simply be pushed as-is -- it requires an explicit, human-verified
 *     reconciliation this session cannot perform without production
 *     access (see the comment in that migration file). This fixture
 *     therefore does NOT replay that migration; it builds an
 *     independently-authored equivalent schema (same table/column/
 *     constraint shape our own code already depends on) to stand in for
 *     production's real, differently-sourced objects -- the closest
 *     available proxy without that migration's actual DDL.
 *   - Production ALREADY has intelligence.score_results.idempotency_key
 *     (NOT NULL) and its unique index, independent of this branch's
 *     20260922090000 migration -- added here directly to prove that
 *     migration's defensive IF-NOT-EXISTS guards correctly no-op against
 *     it rather than failing.
 *   - Production does NOT have intelligence.forecasts / decisions /
 *     event_results / market_settlements -- genuinely absent, which is
 *     what 20260925100000_forecasts_decisions_and_settlements.sql (only
 *     that one; nothing before it in this run) must additively supply.
 *
 * Only 20260922090000 and 20260925100000 are applied on top of this
 * fixture -- not the full migration chain -- because those are the only
 * two migrations this reconciliation unit is about; replaying this
 * branch's full history here would just reproduce the version collision
 * this fixture exists to route around.
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

echo '--- PRODUCTION-EQUIVALENT STATE: independently-authored identity tables + provenance trigger ---'
psql <<'SQL'
CREATE TABLE "catalog"."competition_identities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "competition_id" uuid,
  "provider_id" uuid NOT NULL,
  "provider_competition_id" text NOT NULL,
  "display_name" text NOT NULL,
  "country_code" char(2),
  "mapping_status" text NOT NULL,
  "mapping_confidence" numeric(4, 3),
  "verified_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "competition_identities_provider_identity_unique" UNIQUE("provider_id","provider_competition_id"),
  CONSTRAINT "competition_identities_mapping_status_check" CHECK ("catalog"."competition_identities"."mapping_status" in ('CONFIRMED', 'PENDING_REVIEW', 'REJECTED')),
  CONSTRAINT "competition_identities_confidence_range_check" CHECK ("catalog"."competition_identities"."mapping_confidence" is null or ("catalog"."competition_identities"."mapping_confidence" >= 0 and "catalog"."competition_identities"."mapping_confidence" <= 1))
);
ALTER TABLE "catalog"."competition_identities" ADD CONSTRAINT "competition_identities_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "catalog"."competitions"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "catalog"."competition_identities" ADD CONSTRAINT "competition_identities_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "operations"."providers"("id") ON DELETE restrict ON UPDATE no action;
CREATE INDEX "competition_identities_competition_id_idx" ON "catalog"."competition_identities" USING btree ("competition_id");
REVOKE ALL ON "catalog"."competition_identities" FROM anon, authenticated;

CREATE TABLE "catalog"."event_identities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "event_id" uuid NOT NULL,
  "provider_id" uuid NOT NULL,
  "provider_fixture_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "event_identities_provider_identity_unique" UNIQUE("provider_id","provider_fixture_id"),
  CONSTRAINT "event_identities_event_provider_unique" UNIQUE("event_id","provider_id")
);
ALTER TABLE "catalog"."event_identities" ADD CONSTRAINT "event_identities_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "catalog"."events"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "catalog"."event_identities" ADD CONSTRAINT "event_identities_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "operations"."providers"("id") ON DELETE restrict ON UPDATE no action;
CREATE INDEX "event_identities_event_id_idx" ON "catalog"."event_identities" USING btree ("event_id");
REVOKE ALL ON "catalog"."event_identities" FROM anon, authenticated;

ALTER TABLE "catalog"."events" DROP CONSTRAINT IF EXISTS "events_phase_one_synthetic_check";

CREATE FUNCTION catalog.enforce_event_provenance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF NEW.synthetic = false AND NOT EXISTS (
    SELECT 1 FROM catalog.event_identities WHERE event_id = NEW.id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format('catalog.events %s has synthetic = false with no catalog.event_identities row', NEW.id);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION catalog.enforce_event_provenance() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION catalog.enforce_event_provenance() TO postgres, service_role;
CREATE CONSTRAINT TRIGGER events_provenance_required
AFTER INSERT OR UPDATE OF synthetic ON catalog.events
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION catalog.enforce_event_provenance();

-- Production already has score_results.idempotency_key + its unique
-- index, independent of this branch's own migration for it.
ALTER TABLE "intelligence"."score_results"
  ADD COLUMN "idempotency_key" text NOT NULL DEFAULT gen_random_uuid()::text;
ALTER TABLE "intelligence"."score_results"
  ADD CONSTRAINT "score_results_idempotency_key_unique" UNIQUE ("idempotency_key");
SQL

echo '--- seeding representative data against the production-equivalent schema ---'
psql -f '${wslWorkspace}/supabase/seed.sql'

echo '--- capturing pre-reconciliation state ---'
psql -t -A -F',' -c "
  select 'events', count(*) from catalog.events
  union all select 'participants', count(*) from catalog.participants
  union all select 'competitions', count(*) from catalog.competitions
  union all select 'profiles', count(*) from public.profiles
  union all select 'competition_identities', count(*) from catalog.competition_identities
  order by 1
" > /tmp/velyq-production-upgrade-before.csv
psql -t -A -c "select id, sport_id, competition_id, starts_at, status, synthetic from catalog.events order by id" \\
  > /tmp/velyq-production-upgrade-events-before.txt

echo '--- RECONCILIATION MIGRATIONS ONLY: 20260922090000 (idempotent) then 20260925100000 (additive) ---'
psql -f '${wslWorkspace}/supabase/migrations/20260922090000_score_results_idempotency_key.sql'
psql -f '${wslWorkspace}/supabase/migrations/20260925100000_forecasts_decisions_and_settlements.sql'

echo '--- verifying the release tables now exist ---'
psql -t -A -c "select to_regclass('intelligence.forecasts') is not null" | grep -qx t
psql -t -A -c "select to_regclass('intelligence.decisions') is not null" | grep -qx t
psql -t -A -c "select to_regclass('intelligence.event_results') is not null" | grep -qx t
psql -t -A -c "select to_regclass('intelligence.market_settlements') is not null" | grep -qx t

echo '--- verifying the idempotent score_results migration correctly no-op'"'"'d rather than erroring ---'
psql -t -A -c "
  select count(*) = 1 from pg_constraint
  where conname = 'score_results_idempotency_key_unique'
" | grep -qx t

echo '--- verifying pre-reconciliation data survived unrewritten ---'
psql -t -A -F',' -c "
  select 'events', count(*) from catalog.events
  union all select 'participants', count(*) from catalog.participants
  union all select 'competitions', count(*) from catalog.competitions
  union all select 'profiles', count(*) from public.profiles
  union all select 'competition_identities', count(*) from catalog.competition_identities
  order by 1
" > /tmp/velyq-production-upgrade-after.csv
diff /tmp/velyq-production-upgrade-before.csv /tmp/velyq-production-upgrade-after.csv
psql -t -A -c "select id, sport_id, competition_id, starts_at, status, synthetic from catalog.events order by id" \\
  > /tmp/velyq-production-upgrade-events-after.txt
diff /tmp/velyq-production-upgrade-events-before.txt /tmp/velyq-production-upgrade-events-after.txt

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
    "PASS production-faithful reconciliation: release migrations applied cleanly on top of production-equivalent schema, existing data preserved, DB integration suite green against the reconciled schema",
  );
} finally {
  wsl(stop, true);
  if (!success)
    console.error(
      `Local PostgreSQL production-upgrade logs retained at ${failureLog}`,
    );
}
