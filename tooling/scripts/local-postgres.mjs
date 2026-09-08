import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const workspace = process.cwd();
const port = "55432";
const database = "velyq_integration_test";
const connectionString = `postgresql://postgres@127.0.0.1:${port}/${database}`;
const logDirectory = join(tmpdir(), "velyq-local-postgres");
const failureLog = join(logDirectory, "postgres.log");

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
runtime=$HOME/.cache/velyq-pg-runtime
debs=$HOME/.cache/velyq-pg-debs
data=$HOME/.cache/velyq-pg-data
socket=$HOME/.cache/velyq-pg-socket
bindir=$runtime/usr/lib/postgresql/16/bin
mkdir -p "$runtime" "$debs" "$socket"
if [ ! -x "$bindir/postgres" ]; then
  cd "$debs"
  apt download postgresql-16 postgresql-client-16 libpq5 >/dev/null
  dpkg-deb -x postgresql-16_*.deb "$runtime"
  dpkg-deb -x postgresql-client-16_*.deb "$runtime"
  dpkg-deb -x libpq5_*.deb "$runtime"
fi
export LD_LIBRARY_PATH=$runtime/usr/lib/x86_64-linux-gnu
if [ -f "$data/postmaster.pid" ]; then "$bindir/pg_ctl" -D "$data" -m fast stop || true; fi
rm -rf "$data"
"$bindir/initdb" -D "$data" --username=postgres --auth=trust --no-instructions >/dev/null
printf "listen_addresses = '127.0.0.1'\\nport = ${port}\\nunix_socket_directories = '$socket'\\n" >> "$data/postgresql.conf"
"$bindir/pg_ctl" -D "$data" -l '${wslLog}' -o "-p ${port} -h 127.0.0.1" start >/dev/null
"$bindir/pg_isready" -h 127.0.0.1 -p ${port} -U postgres >/dev/null
"$bindir/dropdb" -h 127.0.0.1 -p ${port} -U postgres --if-exists ${database}
"$bindir/createdb" -h 127.0.0.1 -p ${port} -U postgres ${database}
"$bindir/psql" -q -h 127.0.0.1 -p ${port} -U postgres -d ${database} -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA extensions;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb, raw_app_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
SQL
for migration in $(find '${wslWorkspace}/supabase/migrations' -maxdepth 1 -type f -name '*.sql' | sort); do
  "$bindir/psql" -q -h 127.0.0.1 -p ${port} -U postgres -d ${database} -v ON_ERROR_STOP=1 -f "$migration"
done
"$bindir/psql" -q -h 127.0.0.1 -p ${port} -U postgres -d ${database} -v ON_ERROR_STOP=1 -f '${wslWorkspace}/supabase/seed.sql'
`;

const stop = `
runtime=$HOME/.cache/velyq-pg-runtime
data=$HOME/.cache/velyq-pg-data
export LD_LIBRARY_PATH=$runtime/usr/lib/x86_64-linux-gnu
"$runtime/usr/lib/postgresql/16/bin/pg_ctl" -D "$data" -m fast stop >/dev/null 2>&1 || true
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
  console.log("PASS local PostgreSQL migration, seed and DB integration suite");
} finally {
  wsl(stop, true);
  if (!success)
    console.error(`Local PostgreSQL logs retained at ${failureLog}`);
}
