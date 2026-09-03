# VELYQ workspace

This repository is the Phase 1 VELYQ foundation. It contains no product behavior, no external-provider connection, and no credentials.

Use the pinned Node.js and pnpm runtimes, then install and run the available verification in one command:

```powershell
corepack pnpm bootstrap
```

`lint`, `typecheck`, `test`, and `build` are available now. `test:e2e` and
`mock:replay` remain reserved for later milestones and deliberately return a
nonzero result.

Local database development uses the pinned project Supabase CLI and requires a
running Docker Desktop installation. The database commands never target a
remote project:

```powershell
corepack pnpm db:reset
corepack pnpm db:test
corepack pnpm db:verify
```

`db:test` performs a clean local reset and runs the pgTAP schema, constraint,
append-only, RLS, and grant-boundary suites. `db:verify` additionally checks
local migration status and runs the supported database lint and advisor
commands. If Docker is missing or stopped, each command exits nonzero with the
missing prerequisite instead of skipping database verification.

Use a direct PostgreSQL connection for migration tooling and the transaction
pooler connection (`VELYQ_DATABASE_URL`) for later serverless application
traffic. Credentials and remote connection values do not belong in source
control.
