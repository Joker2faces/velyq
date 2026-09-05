# Phase 1 environment matrix

Audience: engineers configuring local, CI, Vercel preview, staging, production,
and persistent workers. Values are environment-specific; never copy a staging
secret or database URL into production.

## Target matrix

| Target | Supabase project | Database use | Data | Deployment/verification |
| --- | --- | --- | --- | --- |
| Local | Local Supabase from `supabase/config.toml` | Local direct URL for tools; local pooled/direct app URL as appropriate | `supabase/seed.sql`, fictional only | Developer machine; `pnpm db:verify` |
| CI | Ephemeral local Supabase per job | Local CLI-managed database | Fresh migrations and local seed | GitHub runner; all stages fail closed |
| Preview | Dedicated non-production Supabase project or explicitly approved isolated preview schema | Transaction pooler for apps; direct URL only in migration job | Synthetic only; no production copy | Separate customer/admin Vercel previews |
| Staging | Dedicated staging Supabase project | Transaction pooler for apps/workers; direct URL for one migration operator | Guarded synthetic seed | Promotion candidate and hosted smoke target |
| Production | Dedicated production Supabase project | Transaction pooler for runtime; direct URL for approved migration job | No automatic seed; synthetic-only Phase 1 | Manual approval after staging evidence |

Preview must not point at production. If isolated per-preview databases are not
available, share only a designated preview project and treat migrations/data as
shared mutable test state; never run the empty-database staging seed there
without a deliberate reset.

## Variable inventory

| Variable | Consumer | Required | Secret | Rules |
| --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Web/admin browser and server routes | Web/admin runtime | No | Match the target Supabase project; must be an absolute URL. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Web/admin browser and server routes | Web/admin runtime | Public credential | Use only the target's publishable/anon key; never substitute service role. |
| `NEXT_PUBLIC_VELYQ_ADMIN_URL` | Customer web | Recommended outside local | No | Absolute URL of the admin deployment in the same environment. Not used by admin. |
| `VELYQ_DATABASE_URL` | Web, admin, ingestion and prediction workers | Hosted runtime and durable replay | Yes | PostgreSQL transaction-pooler URL. Readiness returns `503` if absent/unreachable. |
| `VELYQ_DATABASE_DIRECT_URL` | Migration operator/CI convention | Migration promotion | Yes | Direct PostgreSQL URL only; applications do not consume it or auto-migrate. |
| `VELYQ_APPLICATION_ORIGIN` | Web/admin authentication redirects | Hosted web/admin | No | Exact external origin for that one deployment, with HTTP(S) scheme and no credentials. |
| `SUPABASE_SERVICE_ROLE_KEY` | Validated server/test configuration | Optional; only if a reviewed server path requires it | Yes | Never expose to browser code. The current application paths do not require it. |
| `VELYQ_SERVICE_NAME` | Validated web/admin configuration | Optional | No | Defaults to `velyq-web` or `velyq-admin`; do not swap the service identities. |
| `VELYQ_LOG_LEVEL` | Validated server/worker configuration | Optional | No | One of `trace`, `debug`, `info`, `warn`, `error`, `fatal`; server default is `info`. |
| `VELYQ_OTEL_ENDPOINT` | Validated server/worker configuration | Optional | Sensitive endpoint | HTTP(S) collector endpoint; telemetry emission is not yet verified end to end. |
| `VELYQ_PROVIDER_MODE` | Validated worker configuration | Worker configuration | No | Must equal `synthetic`; external modes are out of scope. |
| `VELYQ_QUEUE_NAME` | Validated worker configuration | Optional | No | Defaults to `velyq-synthetic`; isolate targets with distinct names. |
| `VELYQ_PROVIDER_ID` | Durable ingestion CLI | With `VELYQ_DATABASE_URL` | No | UUID of the seeded synthetic provider. |
| `VELYQ_PROVIDER_POLICY_VERSION_ID` | Durable ingestion CLI | With `VELYQ_DATABASE_URL` | No | UUID of the applicable synthetic policy version. |
| `VELYQ_QUALITY_POLICY_VERSION_ID` | Durable ingestion CLI | With `VELYQ_DATABASE_URL` | No | UUID of the applicable quality policy version. |
| `VELYQ_FIXTURE_PATH` | Durable ingestion CLI | Optional | No | Provenance label; defaults to `synthetic-replay`. |
| `VELYQ_WORKER_ID` | Prediction worker/config parser | Optional | No | Stable instance identity. Prediction CLI default is `prediction-worker`; generic config default is `velyq-worker`, so set it explicitly in hosted workers. |
| `VELYQ_FIXED_CLOCK` | Prediction worker/test operation | Optional; required for deterministic evidence | No | ISO-8601 timestamp. Do not set in normal continuous operation. |
| `VELYQ_LEASE_DURATION_MS` | Prediction worker | Optional | No | Positive lease duration; defaults to `30000`. |
| `VELYQ_OWNER_USER_ID` | Guarded remote staging seed | Staging seed only | Sensitive identifier | Existing `auth.users` UUID; never invent or commit it. |
| `VELYQ_EXPECTED_PROJECT_REF` | Guarded remote staging seed | Staging seed only | Sensitive identifier | Exact 20-character linked staging project ref. |
| `VELYQ_SYNTHETIC_PREVIEW` | Customer runtime/test harness | Local/E2E only | No | Enables synthetic fallback. Do not set to `true` as a substitute for hosted database readiness. |
| `VELYQ_STAGING_CUSTOMER_URL` | Staging Playwright config | Hosted smoke | No | Exact customer deployment base URL. |
| `VELYQ_STAGING_CUSTOMER_EMAIL` | Staging Playwright config | Hosted smoke | Yes | Dedicated synthetic customer test identity. |
| `VELYQ_STAGING_CUSTOMER_PASSWORD` | Staging Playwright config | Hosted smoke | Yes | Secret for the dedicated customer identity. |
| `VELYQ_STAGING_ADMIN_URL` | Staging Playwright config | Hosted smoke | No | Exact admin deployment base URL. |
| `VELYQ_STAGING_ADMIN_EMAIL` | Staging Playwright config | Hosted smoke | Yes | Dedicated owner/admin test identity. |
| `VELYQ_STAGING_ADMIN_PASSWORD` | Staging Playwright config | Hosted smoke | Yes | Secret for the dedicated admin identity. |
| `VELYQ_E2E_AUTH_PORT` | Local customer auth stub | Optional, local E2E only | No | Defaults to `3101`; must not be configured in hosted targets. |
| `VELYQ_E2E_DATABASE_URL` | Local admin E2E harness | Optional, local E2E only | Yes | Local test database override; must not be configured in hosted targets. |
| `VERCEL_ENV` | Supplied by Vercel | Automatic | No | Reported by health; do not override. |
| `VERCEL_GIT_COMMIT_SHA` | Supplied by Vercel | Automatic | No | Display/record for deployment-to-source verification; do not override. |

The Supabase CLI also needs an authenticated session or its supported access
token in the operator/CI secret store. That credential is infrastructure
configuration, not an application variable.

## Scope assignment

| Variable group | Local | CI | Preview | Staging | Production |
| --- | --- | --- | --- | --- | --- |
| Public Supabase URL/key | Local values | E2E/local values | Preview values | Staging values | Production values |
| Admin URL | Local admin URL | E2E stub | Matching preview | Staging admin | Production admin |
| Pooled database URL | Optional for UI fallback; required durable path | Local integration only | Required | Required | Required |
| Direct database URL | Local CLI | Ephemeral local CLI | Migration job only | Migration job only | Migration job only |
| Synthetic provider/queue | Synthetic | Synthetic | Synthetic | Synthetic | Synthetic |
| Durable replay IDs | From local seed | From local seed | If replay is enabled | Required for rehearsal | Only for approved synthetic operation |
| Owner/project seed guards | Not used | Not used | Not used | One-time empty staging seed | Never use |
| Fixed clock/preview fallback | Tests only | Tests | Smoke fixtures only | Acceptance replay only | Unset in normal runtime |

## Validation checklist

1. Confirm URLs resolve to the intended target before entering credentials.
2. Confirm direct and pooled URLs share the intended project but have the
   correct connection mode.
3. Confirm no service-role or database value starts with `NEXT_PUBLIC_`.
4. Confirm customer and admin deployments use the same Supabase target and
   different Vercel projects.
5. Confirm preview/staging/production values are separately scoped in Vercel.
6. Rotate any value printed to logs or committed accidentally, then purge it
   from deployment and Git history under the incident process.
