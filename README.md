# VELYQ workspace

VELYQ Phase 1 is a synthetic-only sports market intelligence staging system.
It includes separate customer (`apps/web`) and operational admin (`apps/admin`)
Next.js applications, governed replay/ingestion workers, exact decimal
analytics, traceable predictions, and protected Supabase-backed BFF contracts.
It contains no real-provider connection and no credentials.

Use the pinned Node.js and pnpm runtimes, then install and run the available verification in one command:

```powershell
corepack pnpm bootstrap
```

The canonical local verification is `corepack pnpm verify`, followed by
`corepack pnpm test:e2e`. The built replay CLI is available through
`node workers/ingestion/dist/cli.js <fixed-iso-clock>`.

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

Deployment and rollback guidance is in
`docs/operations/phase-1-runbook.md`. Customer and admin expose
`/api/health` and `/api/ready`. Deployment protection remains enabled;
production promotion and main-branch merge require explicit approval.
