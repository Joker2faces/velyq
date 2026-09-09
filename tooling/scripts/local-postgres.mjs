import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
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
runtime=$HOME/.cache/velyq-pg-runtime-17
debs=$HOME/.cache/velyq-pg-debs-17
data=$HOME/.cache/velyq-pg-data-17
socket=$HOME/.cache/velyq-pg-socket-17
bindir=$runtime/usr/lib/postgresql/17/bin
mkdir -p "$runtime" "$debs" "$socket"
if [ ! -x "$bindir/postgres" ]; then
  cd "$debs"
  # Ubuntu 24.04's own apt repo only carries PostgreSQL 16, and production
  # Supabase runs PostgreSQL 17 -- pull the real PGDG (postgresql.org) build
  # for Ubuntu 24.04 (noble) instead, without adding an apt source or
  # touching anything system-wide (no sudo, no apt-key, no permanent
  # install): download the three .deb files this needs directly from the
  # PGDG pool and extract them into this disposable, user-owned cache.
  # libpq5 for PG17 is published from the postgresql-18 source package
  # (PGDG bumps libpq's source alongside the newest major), so it is
  # resolved from the same package index rather than assumed.
  if [ ! -f Packages.gz ]; then
    curl -sf --max-time 60 -o Packages.gz \\
      https://apt.postgresql.org/pub/repos/apt/dists/noble-pgdg/main/binary-amd64/Packages.gz
  fi
  # Decompressed to a real file rather than piped into awk: an awk 'exit'
  # fed by a pipe leaves gunzip still writing to a now-closed pipe, which
  # kills it with SIGPIPE -- fatal here because of 'set -o pipefail' above.
  if [ ! -f Packages ]; then gunzip -k -c Packages.gz > Packages; fi
  filename() {
    awk -v pkg="$1" '$0 == "Package: " pkg {p=1; next} p && /^Filename:/ {print $2; exit} /^Package: /{p=0}' Packages
  }
  server_path=$(filename postgresql-17)
  client_path=$(filename postgresql-client-17)
  libpq_path=$(filename libpq5)
  [ -n "$server_path" ] && [ -n "$client_path" ] && [ -n "$libpq_path" ]
  curl -sf --max-time 120 -o server.deb "https://apt.postgresql.org/pub/repos/apt/$server_path"
  curl -sf --max-time 120 -o client.deb "https://apt.postgresql.org/pub/repos/apt/$client_path"
  curl -sf --max-time 120 -o libpq5.deb "https://apt.postgresql.org/pub/repos/apt/$libpq_path"
  dpkg-deb -x server.deb "$runtime"
  dpkg-deb -x client.deb "$runtime"
  dpkg-deb -x libpq5.deb "$runtime"
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
runtime=$HOME/.cache/velyq-pg-runtime-17
data=$HOME/.cache/velyq-pg-data-17
export LD_LIBRARY_PATH=$runtime/usr/lib/x86_64-linux-gnu
"$runtime/usr/lib/postgresql/17/bin/pg_ctl" -D "$data" -m fast stop >/dev/null 2>&1 || true
`;

let success = false;
try {
  wsl(bootstrap);
  const testOutput = run(
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
  console.log(testOutput);
  success = true;
  console.log("PASS local PostgreSQL migration, seed and DB integration suite");
} finally {
  wsl(stop, true);
  if (!success)
    console.error(`Local PostgreSQL logs retained at ${failureLog}`);
}
