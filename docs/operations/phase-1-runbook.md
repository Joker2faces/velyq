# VELYQ Phase 1 staging runbook

Phase 1 is synthetic-only. The customer and admin apps must never connect to
real bookmaker or sports-provider feeds.

## Local verification

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm verify
corepack pnpm test:e2e
corepack pnpm db:verify
```

`db:verify` requires Docker Desktop and runs a local Supabase reset, migration
status check, pgTAP suite, database lint, and advisors. It never targets the
remote staging project. The deterministic built replay is:

```powershell
node workers/ingestion/dist/cli.js 2026-09-03T11:00:00Z
```

Run it twice with the same fixed clock and compare output before accepting a
checkpoint.

## Environments and secrets

Vercel customer root: `apps/web`. Vercel admin root: `apps/admin`.
Public environment names are `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. The optional customer-to-admin link is
configured with `NEXT_PUBLIC_VELYQ_ADMIN_URL`; it is a public URL, not a secret.
Server-only names are
`VELYQ_DATABASE_URL` and future provider credentials. Server-only values must
be entered through the hosting secret store, never committed, and never
prefixed with `NEXT_PUBLIC_`.

Use a direct PostgreSQL connection for migrations and a transaction-pooler
connection for serverless application traffic. Vercel instances do not
auto-migrate on startup.

## Health, deployment, and rollback

Customer and admin expose `/api/health` and `/api/ready`. Health is liveness;
readiness returns `503` when required runtime configuration is absent and never
exposes secret values. Deploy only pushed, reviewed checkpoints, verify the
deployment commit SHA, and keep deployment protection enabled.

If a deployment is unhealthy, stop promotion, preserve logs and request IDs,
and return traffic to the last verified deployment through the Vercel UI. Do
not rewrite Git history or delete database history. Database changes are
forward-only reviewed migrations; never edit migration history manually or
run an uncommitted migration against staging.

The admin read-only views/API provide provider runs, prediction traces, scores,
quality assessments, and audit events. Investigate failures by persisted IDs
and correlation/request IDs.
