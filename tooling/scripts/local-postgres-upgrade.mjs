import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Proves the real upgrade path, not just a fresh-database migration: apply
 * migrations up to a real repository boundary (the last migration before
 * this feature's own identity/live-data and forecast/decision/settlement
 * work), seed representative data against that older schema, then apply the
 * remaining migrations on top and verify the earlier data survived
 * unrewritten and the new schema is fully present.
 *
 * The boundary is a real migration filename from supabase/migrations, not a
 * hand-built schema: everything up to and including
 * 20260905192925_harden_private_authorization_tables.sql is the pre-existing
 * Phase 1 schema; 20260908090000_provider_identity_and_live_data.sql and
 * 20260908120000_forecasts_decisions_and_settlements.sql are what this
 * feature added on top of it. supabase/seed.sql only touches tables that
 * already existed at the boundary, so it doubles as the "representative
 * valid data" for the older schema without inventing anything.
 */
const UPGRADE_BOUNDARY = "20260905192925_harden_private_authorization_tables";

const workspace = process.cwd();
const port = "55433";
const database = "velyq_upgrade_test";
const connectionString = `postgresql://postgres@127.0.0.1:${port}/${database}`;
const logDirectory = join(tmpdir(), "velyq-local-postgres");
const failureLog = join(logDirectory, "postgres-upgrade.log");

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

const bootstrap = `
set -euo pipefail
runtime=$HOME/.cache/velyq-pg-runtime-17
data=$HOME/.cache/velyq-pg-data-upgrade
socket=$HOME/.cache/velyq-pg-socket-upgrade
bindir=$runtime/usr/lib/postgresql/17/bin
mkdir -p "$socket"
# Reuses the PG17 binaries the fresh-migration gate (local-postgres.mjs)
# already downloaded into this cache; this script never re-downloads them
# and fails loudly if they are missing rather than silently falling back
# to a different version.
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

echo '--- REPRESENTATIVE OLD SCHEMA: applying migrations up to ${UPGRADE_BOUNDARY} ---'
boundary_reached=0
for migration in $(find '${wslWorkspace}/supabase/migrations' -maxdepth 1 -type f -name '*.sql' | sort); do
  psql -f "$migration"
  case "$migration" in
    *${UPGRADE_BOUNDARY}*) boundary_reached=1; break ;;
  esac
done
[ "$boundary_reached" = "1" ]

echo '--- seeding representative data against the older schema ---'
psql -f '${wslWorkspace}/supabase/seed.sql'

echo '--- capturing pre-upgrade state ---'
psql -t -A -F',' -c "
  select 'events', count(*) from catalog.events
  union all select 'participants', count(*) from catalog.participants
  union all select 'competitions', count(*) from catalog.competitions
  union all select 'profiles', count(*) from public.profiles
  order by 1
" > /tmp/velyq-upgrade-before.csv
psql -t -A -c "select id, sport_id, competition_id, starts_at, status, synthetic from catalog.events order by id" \\
  > /tmp/velyq-upgrade-events-before.txt

echo '--- NEW MIGRATIONS: applying the remaining migration chain ---'
past_boundary=0
for migration in $(find '${wslWorkspace}/supabase/migrations' -maxdepth 1 -type f -name '*.sql' | sort); do
  if [ "$past_boundary" = "0" ]; then
    case "$migration" in
      *${UPGRADE_BOUNDARY}*) past_boundary=1 ;;
    esac
    continue
  fi
  psql -f "$migration"
done

echo '--- verifying current schema is fully present ---'
psql -t -A -c "select to_regclass('catalog.competition_identities') is not null" | grep -qx t
psql -t -A -c "select to_regclass('catalog.event_identities') is not null" | grep -qx t
psql -t -A -c "select to_regclass('intelligence.forecasts') is not null" | grep -qx t
psql -t -A -c "select to_regclass('intelligence.decisions') is not null" | grep -qx t
psql -t -A -c "select to_regclass('intelligence.event_results') is not null" | grep -qx t
psql -t -A -c "select to_regclass('intelligence.market_settlements') is not null" | grep -qx t
psql -t -A -c "
  select count(*) = 0 from pg_constraint
  where conname = 'events_phase_one_synthetic_check'
" | grep -qx t

echo '--- verifying the deferred provenance trigger from the newer migration is active ---'
psql -t -A -c "
  select count(*) = 1 from pg_trigger where tgname = 'events_provenance_required'
" | grep -qx t

echo '--- verifying pre-upgrade data survived unrewritten ---'
psql -t -A -F',' -c "
  select 'events', count(*) from catalog.events
  union all select 'participants', count(*) from catalog.participants
  union all select 'competitions', count(*) from catalog.competitions
  union all select 'profiles', count(*) from public.profiles
  order by 1
" > /tmp/velyq-upgrade-after.csv
diff /tmp/velyq-upgrade-before.csv /tmp/velyq-upgrade-after.csv
psql -t -A -c "select id, sport_id, competition_id, starts_at, status, synthetic from catalog.events order by id" \\
  > /tmp/velyq-upgrade-events-after.txt
diff /tmp/velyq-upgrade-events-before.txt /tmp/velyq-upgrade-events-after.txt

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
data=$HOME/.cache/velyq-pg-data-upgrade
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
    "PASS representative upgrade migration path, preserved data, and DB integration suite against the upgraded schema",
  );
} finally {
  wsl(stop, true);
  if (!success)
    console.error(`Local PostgreSQL upgrade logs retained at ${failureLog}`);
}
