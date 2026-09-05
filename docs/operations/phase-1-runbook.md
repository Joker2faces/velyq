# VELYQ Phase 1 operations runbook

This runbook is for the engineer operating the synthetic-only Phase 1 stack.
It covers local verification, Supabase migration and seed promotion, owner
bootstrap, deterministic replay, Vercel deployment, health checks, and
rollback. It does not authorize real sports/provider data, production model
claims, or automated betting.

## Safety invariants

- Phase 1 accepts only fictional fixtures and synthetic providers/bookmakers.
- Use a direct PostgreSQL connection only for migration tooling. Use the
  transaction pooler for web, admin, and worker traffic.
- Vercel instances never migrate or seed a database on startup.
- Run the remote seed only against an empty staging database. The guard refuses
  any non-empty sentinel table and never inserts an `auth.users` row.
- Treat migrations and protected history as forward-only. Never edit an
  applied migration or update/delete append-only observations, predictions,
  scores, provider runs, or audit events.
- Keep credentials in the host secret store. Never prefix server credentials
  with `NEXT_PUBLIC_`.

The complete variable inventory and target-by-target values are in
[environment-matrix.md](./environment-matrix.md). Review
[known-limitations.md](./known-limitations.md) before promotion.

## 1. Rehearse locally

Prerequisites: Git, Node.js 24.15.x, Corepack, pnpm 11.25.x, and Docker Desktop
with a reachable Linux container daemon.

```powershell
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm verify
corepack pnpm test:e2e
corepack pnpm db:verify
corepack pnpm worker:verify
```

Expected output: every command exits `0`; Vitest and Playwright report no
failed tests; both Next.js applications build; `db:verify` completes reset,
migration listing, pgTAP, lint, and advisors; worker readiness ends with
`Worker readiness: PASS`.

`db:verify` is local-only. It starts local Supabase, resets it from all files in
`supabase/migrations/`, applies `supabase/seed.sql`, runs `supabase/tests/`, and
fails rather than silently skipping Docker-dependent checks.

## 2. Review and promote migrations

1. Confirm the target and migration history before changing it.

   ```powershell
   corepack pnpm exec supabase projects list
   corepack pnpm exec supabase migration list --linked
   corepack pnpm exec supabase db push --linked --dry-run
   ```

   Expected output: the intended project is marked linked; local and remote
   migration histories agree up to the current remote version; dry-run lists
   only the reviewed, unapplied migration files.

2. Take the provider's required backup/snapshot and record its identifier in
   the change ticket. Resolve schema drift before continuing.

3. Apply migrations once, from an approved operator/CI context.

   ```powershell
   corepack pnpm exec supabase db push --linked
   corepack pnpm exec supabase migration list --linked
   ```

   Expected output: push succeeds and every repository migration is present in
   both local and remote columns. Do not deploy applications if this fails.

For production, use a separately linked production project and repeat the same
preflight. Never reuse staging URLs, keys, pooled URLs, or project references.

## 3. Bootstrap the owner and seed staging

1. Create the owner through Supabase Auth using the normal invite/create-user
   flow. Do not insert directly into `auth.users`. Copy the resulting UUID.

2. Link the CLI to the staging project, then set process-scoped guard values.

   ```powershell
   $env:VELYQ_OWNER_USER_ID = '<existing-auth-user-uuid>'
   $env:VELYQ_EXPECTED_PROJECT_REF = '<20-character-staging-project-ref>'
   node tooling/scripts/remote-staging-seed.mjs
   ```

   Expected output: `Applying atomic staging seed (...)` followed by
   `Remote staging seed complete; no auth.users rows were inserted.`

The script verifies the linked project reference, checks every Phase 1 sentinel
table is empty, replaces only the local synthetic admin identity with the
existing owner UUID, grants `USER` and `ADMIN`, and applies the seed in one
transaction. It is intentionally unsuitable for production or reseeding.

3. Verify the owner without exposing email or token values.

   ```sql
   select r.code
   from private.user_roles ur
   join private.roles r on r.id = ur.role_id
   where ur.user_id = '<existing-auth-user-uuid>'::uuid
   order by r.code;
   ```

   Expected output: exactly two rows, `ADMIN` and `USER`.

## 4. Replay synthetic ingestion and drain prediction work

For an in-memory deterministic replay, omit database variables:

```powershell
Remove-Item Env:VELYQ_DATABASE_URL -ErrorAction SilentlyContinue
node workers/ingestion/dist/cli.js 2026-09-03T11:00:00Z
node workers/ingestion/dist/cli.js 2026-09-03T11:00:00Z
```

Expected output: both runs emit the same JSON summary for all four fixture
sequences. The built artifact must include `sequence-01-opening`.

For durable replay, set the pooled database URL plus the IDs selected from the
seeded policy rows:

```powershell
$env:VELYQ_DATABASE_URL = '<transaction-pooler-url>'
$env:VELYQ_PROVIDER_ID = '<synthetic-provider-uuid>'
$env:VELYQ_PROVIDER_POLICY_VERSION_ID = '<provider-policy-version-uuid>'
$env:VELYQ_QUALITY_POLICY_VERSION_ID = '<quality-policy-version-uuid>'
$env:VELYQ_FIXTURE_PATH = 'synthetic-replay'
node workers/ingestion/dist/cli.js 2026-09-03T11:00:00Z
node workers/prediction/dist/cli.js
```

Expected output: ingestion returns accepted/rejected/duplicate/job counts; the
prediction worker returns one job result. Repeat the ingestion command with the
same clock to prove the replay identity is idempotent, then drain queued jobs by
running the prediction command until it reports no claimed job.

## 5. Deploy web and admin

Create two Vercel projects from the same repository:

| Project | Root directory | Application package | Public URL use |
| --- | --- | --- | --- |
| Customer | `apps/web` | `@velyq/web` | Public customer URL |
| Admin | `apps/admin` | `@velyq/admin` | Restricted admin URL |

Enable access to workspace files outside each root and retain the repository
lockfile. Configure the preview, staging, and production scopes separately as
defined in the environment matrix. Set `NEXT_PUBLIC_VELYQ_ADMIN_URL` only on
the customer project and point it to the matching admin environment.

Deploy in this order: database migrations, optional empty-staging seed,
customer preview, admin preview, preview smoke test, staging promotion, staging
smoke test, then manual production approval. Record each deployment URL and Git
SHA. Workers require persistent compute and are not deployed as Vercel request
functions.

## 6. Verify health and smoke paths

```powershell
Invoke-RestMethod 'https://<customer-host>/api/health'
Invoke-RestMethod 'https://<customer-host>/api/ready'
Invoke-RestMethod 'https://<admin-host>/api/health'
Invoke-RestMethod 'https://<admin-host>/api/ready'
```

Expected output: health returns HTTP `200` with `status: ok`; readiness returns
HTTP `200` with `status: ready` and both non-sensitive configuration checks set
to `true`. A readiness `503` identifies whether the database or Auth
configuration is absent; when both are configured, it means PostgreSQL or
Supabase Auth is unavailable. Responses do not reveal secret values.

Run the staging smoke suite only after both URLs resolve:

```powershell
$env:VELYQ_STAGING_CUSTOMER_URL = 'https://<customer-host>'
$env:VELYQ_STAGING_CUSTOMER_EMAIL = '<customer-email>'
$env:VELYQ_STAGING_CUSTOMER_PASSWORD = '<customer-password>'
$env:VELYQ_STAGING_ADMIN_URL = 'https://<admin-host>'
$env:VELYQ_STAGING_ADMIN_EMAIL = '<admin-email>'
$env:VELYQ_STAGING_ADMIN_PASSWORD = '<admin-password>'
$required = @(
  'VELYQ_STAGING_CUSTOMER_URL',
  'VELYQ_STAGING_CUSTOMER_EMAIL',
  'VELYQ_STAGING_CUSTOMER_PASSWORD',
  'VELYQ_STAGING_ADMIN_URL',
  'VELYQ_STAGING_ADMIN_EMAIL',
  'VELYQ_STAGING_ADMIN_PASSWORD'
)
$missing = $required | Where-Object { [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($_)) }
if ($missing) { throw "Missing staging smoke variables: $($missing -join ', ')" }
corepack pnpm exec playwright test --config tooling/e2e/staging.playwright.config.ts
```

Expected output: Playwright reports two passed tests and zero skipped tests.
Without the explicit preflight above, the current suite skips tests whose
credentials are absent, which is not acceptance evidence. Then sign in as the
owner and trace one featured result through provider run, source observation,
quality, prediction, score, and audit views.

## Operational queries

Run the SQL in [queries/README.md](./queries/README.md) with a database role
that has only the required `SELECT` grants. Export results with timestamps and
request/correlation IDs before remediation.

## Rollback

### Application rollback

1. Stop promotion and preserve deployment/runtime logs, request IDs, and the
   failing Git SHA.
2. Reassign customer and admin traffic to their last independently verified
   Vercel deployments. Roll back both only when a shared contract changed.
3. Re-run `/api/health`, `/api/ready`, staging smoke, and one authenticated
   trace. Record the restored deployment IDs.

### Database rollback

Do not delete migration history or run a reverse migration automatically.
Disable dependent traffic/workers, take a snapshot, and prefer a reviewed
forward-fix migration. If restoration is unavoidable, restore to a new database
instance, validate migration history and data, rotate URLs/credentials, and
promote it through the same readiness gates.

### Seed/replay recovery

The remote seed has no destructive undo. For staging-only bad seed data,
replace the disposable staging database from a known snapshot or recreate it,
then run migrations and the guarded seed. For a replay incident, stop workers,
preserve provider run/job IDs and hashes, correct the code or policy, and replay
with a new reviewed identity when required; never mutate historical rows.

## Escalation

- GitHub billing lock: repository/account administrator.
- Vercel quota or rate limit: Vercel team owner/support; do not loop retries.
- Supabase migration, restore, or project-link ambiguity: database owner.
- Synthetic labeling, model maturity, or provider-policy breach: stop release
  and escalate to the Phase 1 technical owner.
