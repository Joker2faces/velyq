# VELYQ Cloudflare Migration Completion Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete `cloudflare/velyq-poc` with Supabase Auth, Hyperdrive-backed PostgreSQL authorization, real entitlements, green verification, and no Vercel regression.

**Architecture:** Keep `packages/database` platform-neutral. Select a Node database-source module for normal Next and an `env.HYPERDRIVE.connectionString` source module for Vinext through an exact Vite alias. Both feed a shared async, request-scoped database session that owns and closes `pg`/Drizzle resources.

**Tech Stack:** Next 16.3.4, Vinext 1.0.0-beta.9, Wrangler 4.129.0, Cloudflare Hyperdrive, `pg` 8.23.0, Drizzle 0.45.2, Supabase Auth, Vitest, Playwright, pnpm 11.25.0.

**Spec:** User-approved VELYQ Cloudflare Migration Completion Plan in this task.

## Global Constraints

- Work only on `cloudflare/velyq-poc`; never modify `main`, `integration/phase-1`, `feat/phase-1-foundation`, Vercel production, Supabase schema/data, or PR #3.
- Hyperdrive binding is `HYPERDRIVE`, ID `660fd984521442f8be51b97740eb3d4a`.
- Cloudflare uses OAuth with `CLOUDFLARE_API_TOKEN` unset.
- Never configure `VELYQ_DATABASE_URL` or Stripe on Cloudflare.
- Keep `VELYQ_CUSTOMER_INTELLIGENCE_MODE=SYNTHETIC_DEMO`; remove `VELYQ_SYNTHETIC_PREVIEW` only after readiness and real authorization pass.

### Task 1: Normalize Phase 3A and generated types

**Files:** `apps/web/wrangler.jsonc`, `apps/web/worker-configuration.d.ts`, `apps/web/tsconfig.json`, `eslint.config.mjs`, `apps/web/next-env.d.ts`.
**Interfaces:** generated `Env.HYPERDRIVE: Hyperdrive`.

- [ ] Review and preserve intentional dirty changes; restore generated-only `next-env.d.ts` changes.
- [ ] Write/execute the failing clean-type-generation reproduction, then add `clean:next` and `typegen:next` scripts in `apps/web/package.json` so Next types are regenerated before standalone typecheck.
- [ ] Run `wrangler types`, clean Next build, typecheck after Vinext build, and confirm lockfiles remain unchanged.
- [ ] Commit `chore: add Cloudflare Hyperdrive binding types` and `fix: make Next route type generation reproducible`.

**Gate:** clean Next typecheck passes before and after Vinext generation.

### Task 2: Complete auth outage UX and copy

**Files:** sign-in/sign-up routes and pages in `apps/web/app`, `packages/ui/src/messages.ts`, `apps/web/test/auth-outage.test.ts`.
**Interfaces:** `error=unavailable`, `authSignInUnavailable`, `authSignUpUnavailable`.

- [ ] Add failing route/page/copy tests for unavailable versus invalid credentials and exact EN/EL copy.
- [ ] Implement separate unavailable messages, preserve JSON codes, and leave `termsBody1` unchanged.
- [ ] Run focused tests and lint.
- [ ] Commit `fix: distinguish authentication outages from invalid credentials`.

**Gate:** outage and credential failures are distinct in EN/EL.

### Task 3: Platform-isolated database source

**Files:** create `apps/web/app/runtime-database/{types,runtime-database-source,runtime-database-source.cloudflare}.ts`, modify `apps/web/vite.config.ts`, create `apps/web/test/runtime-database-source.test.ts`.
**Interfaces:** `RuntimeDatabaseSource = {kind:"node"|"hyperdrive";connectionString:string}` and `resolveRuntimeDatabaseSource(): Promise<RuntimeDatabaseSource|null>`.

- [ ] Add failing tests for Node URL, Hyperdrive binding, no source, and Node graph isolation.
- [ ] Implement Node source using only `VELYQ_DATABASE_URL`; implement Cloudflare source with static `cloudflare:workers` import.
- [ ] Alias only the exact source module in Vinext/Vite; normal Next resolves the Node file.
- [ ] Run focused tests plus both builds.
- [ ] Commit `feat: isolate Node and Cloudflare database sources`.

**Gate:** both builds pass and only Vinext contains `cloudflare:workers`.

### Task 4: Runtime database session and caller migration

**Files:** create `apps/web/app/runtime-database/runtime-database.ts`; modify `customer-database.ts`, `customer-runtime.ts`, `api/auth.ts`, readiness, billing and odds-history routes; add runtime DB/authorization/caller tests.
**Interfaces:** `RuntimeDatabaseSession {source;client;database;close()}`; `openRuntimeDatabaseSession(): Promise<RuntimeDatabaseSession|null>`; `openDatabaseCustomerQueries(): Promise<{queries;close}|null>`.

- [ ] Add failing lifecycle, authorization, entitlement, and cleanup tests.
- [ ] Build request-scoped Hyperdrive sessions with the existing privileged client and deterministic `finally` cleanup.
- [ ] Refactor every `apps/web` DB caller to async acquisition; preserve repositories, mappers, permissions, subscriptions and Stripe-disabled behavior.
- [ ] Confirm `rg VELYQ_DATABASE_URL apps/web/app` finds only the Node source module.
- [ ] Run focused tests and typecheck.
- [ ] Commit `feat: add dual-runtime database sessions`, then `refactor: migrate web database callers to runtime sessions`.

**Gate:** no global Hyperdrive pool and no direct DB environment assumptions outside the Node source.

### Task 5: Hyperdrive readiness

**Files:** `apps/web/app/api/ready/route.ts`, `apps/web/test/ready-route.test.ts`.

- [ ] Add failing tests for Node, Hyperdrive, absent source, failed `SELECT 1`, healthy Supabase Auth, and cleanup.
- [ ] Execute `SELECT 1` through `openRuntimeDatabaseSession()` and retain the Supabase settings probe.
- [ ] Run focused tests and typecheck.
- [ ] Commit `feat: validate Hyperdrive in customer readiness`.

**Gate:** readiness is source-agnostic and returns 200 only when DB and Auth are healthy.

### Task 6: Full local verification

- [ ] Run format, lint, typecheck, unit tests, safe integration tests, Playwright, `pnpm verify`, normal Next build, Vinext build, then Next typecheck again.
- [ ] For each failure, add a failing regression test, implement the smallest fix, rerun focused/full checks, and commit `fix: resolve Cloudflare migration verification failures`.
- [ ] Perform task reviews and a whole-branch review; resolve Critical/Important findings.

**Commands:** `corepack pnpm format`, `lint`, `typecheck`, `test`, `test:integration`, `test:e2e`, `verify`, `--filter @velyq/web build`, and `--filter @velyq/web build:vinext`.

**Gate:** all checks pass, including existing 373+ tests and new tests.

### Task 7: Push, deploy, tail and remove bypass

- [ ] Commit remaining verified changes, push only `cloudflare/velyq-poc`, and confirm local HEAD equals remote HEAD.
- [ ] Deploy from `apps/web` with OAuth; verify `/api/health` and `/api/ready` return 200.
- [ ] Tail `velyq-poc` in JSON while exercising readiness, invalid login and protected routes; confirm Hyperdrive query metrics increase and no unexplained runtime errors occur.
- [ ] Remove `VELYQ_SYNTHETIC_PREVIEW`, add/confirm failing security tests, rerun `pnpm verify`, commit `security: disable synthetic Cloudflare authorization bypass`, push and redeploy.
- [ ] Verify unauthenticated API returns 401 and readiness stays 200.

**Gate:** live DB/Auth are healthy, Hyperdrive has traffic, and synthetic authorization is absent.

### Task 8: Real entitlement and release evidence

- [ ] Exercise existing secure identities only: missing `customer.read` -> 403; FREE preview/match lock; PRO full EDGE/RADAR and match lock; ELITE match access; admin independent of plan.
- [ ] Validate Today, EDGE, RADAR, Account, Match, logout/login, EN/EL and numeric formatting.
- [ ] Fix any defect test-first, rerun all checks, commit/push/redeploy, and repeat tail/live tests until green.
- [ ] Record final/remote/deployed SHA, Worker version, Hyperdrive query evidence, health/readiness, auth/entitlement outcomes, test counts, builds and zero unexplained errors.

**Gate:** remote `cloudflare/velyq-poc` equals the deployed verified commit. If suitable secure plan identities do not exist, mark only those live plan cases genuinely not executable; never mutate production users or entitlements.
