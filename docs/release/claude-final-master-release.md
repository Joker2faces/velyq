# VELYQ — Claude Final Master Release Log

Persistent work state for the final release. Updated continuously; this file,
not chat history, is the source of truth for progress.

## Session context

- Owner is on the **home** computer. Previous work was done on the work computer.
- Durable source of truth: <https://github.com/Joker2faces/velyq>
- Working checkout: `.worktrees/final-release-home` (worktree, so the main
  checkout's unpushed `master` is never disturbed).
- Toolchain: Node 24.15.0, pnpm 11.25.0 installed to `C:\Users\thodo\.npm-global`
  (corepack's global shim needs administrator rights on this machine, so turbo
  could not find a `pnpm` binary until pnpm was installed to a user prefix).
  **Every command must run with that directory on `PATH`.**

## Release base decision (owner-approved)

Local `master` (`3a5f0cb`) had **41 commits that existed nowhere on GitHub** and
had diverged from the release branch at merge-base `3bd0a46`. A trial merge
produced **21 conflicting files** in the product core (Today/EDGE/RADAR views,
match detail, customer runtime, auth, provider ingestion) because both lines
independently implemented the same features.

Owner decision: **preserve master, then release exclusively from the codex
lineage. Do not merge.**

| Item | Value |
| --- | --- |
| Release branch | `codex/velyq-final-product-v1` |
| Start SHA | `90d90c0b975e3d76bfd2540ede9440ea726f7ff1` (matches expected) |
| Preserved backup branch | `backup/home-master-unique-20260909` = `3a5f0cbc133b40813fbb5f6824689e2e5c6abf68` |
| Preserved bundle | `C:\Users\thodo\velyq-backups\velyq-home-master-unique-20260909.bundle` (4.9 MB, `git bundle verify` OK) |

### Why pushing the backup branch was safe

Verified before pushing, as the owner required:

1. The `velyq` Vercel project has **no connected Git repository** —
   `vercel project inspect velyq` shows no Git section, and every deployment
   (Production included) is attributed to CLI user `joker2faces`, never to a
   commit. A git push therefore cannot trigger any Vercel deployment.
2. `.github/workflows/ci.yml` triggers only on `main`,
   `feat/phase-1-foundation`, `integration/**`, pull requests and manual
   dispatch. A `backup/**` branch matches none of them.

### Master-only work NOT in this release (deliberate)

Left on the backup branch for separate review, per owner instruction. Not
assumed to belong in this release:

- `packages/analytics/src/fortress-multi.ts` (+ test) — correlation-aware parlay engine
- `packages/analytics/src/intelligence-v2.ts` (+ test)
- `packages/analytics/src/research-v3.ts` (+ devig test)
- A parallel client/server UI split (`today-client.tsx`, `edge-client.tsx`,
  `radar-client.tsx`, `loading.tsx` per route, `site-chrome.tsx`, `ui.tsx`,
  `icons.tsx`, `pricing/page.tsx`, `sign-in/page.tsx`)
- `apps/web/app/api/internal/provider-ingest/**` (a second ingestion route)

Note: `packages/market-semantics/src/devig.ts` is **byte-identical** on both
branches, so master's de-vig work is already present in the release lineage.

## Deployment target (verified)

| Item | Value |
| --- | --- |
| Vercel project | `velyq` |
| Project ID | `prj_XeLstdKUMp5q3erxVFyO3Oh8xSvs` |
| Org / team ID | `team_vQN1raOYespGG8CZES6KEEtq` |
| Production URL | <https://project-cf8ty.vercel.app> |
| Root directory | `apps/web` |
| Framework | Next.js, Node 24.x |
| CLI auth | authenticated as `joker2faces` (no owner login needed) |
| Admin project | `velyq-admin-staging` (exists; do not create new projects) |

### Rollback target (recorded before any deploy)

Current production deployment at session start:
`https://velyq-gfpc9m30r-joker2faces-projects.vercel.app` (Ready, Production,
~16h old at session start).

## P0

| # | Issue | State |
| --- | --- | --- |
| P0-1 | Match Intelligence showed "available on ELITE" to the ADMIN/OWNER account | **FIXED — unit verified** |

### P0-1 detail — administrative product access

Root cause: `resolveCustomerEntitlements` in `packages/auth/src/index.ts`
derived entitlements from the **billing plan alone**. `requireCustomerSession`
already resolved a server-side `Principal` from database permission rows and
checked `customer.read`, but then **discarded the principal's role** and
decided entitlements from `{plan, status}`. The operator account has no
subscription, so it resolved to `FREE`, which lacks `match.detail` — and both
the API route (`/api/v1/events/[eventId]/intelligence`) and the page
(`matches/[id]` via `loadCustomerMatch`) funnel through that one decision.
Billing is deliberately deferred, so testing the product had become dependent
on a commercial tier.

Fix (server-authoritative, one layer):

- `packages/auth/src/index.ts`: added `grantsFullProductAccess(principal)` —
  true only when the principal's role is `ADMIN` **and** it holds
  `admin.access` — and `resolveEffectiveEntitlements(context, principal)`,
  which widens the capability set for such a principal while leaving the
  reported `plan` / `subscriptionStatus` truthful.
- `apps/web/app/api/auth.ts`: `entitlementDecision` now takes the
  already-resolved `principal` and uses `resolveEffectiveEntitlements`.
- `apps/web/app/customer-runtime.ts`: `resolveCustomerContext` likewise.

Deliberately unchanged: the `PLAN_ENTITLEMENTS` matrix (commercial gating stays
enforceable when billing ships), `plan-config.ts` (describes the public offer,
correctly plan-based) and `api/v1/billing/projection` (a commercial
projection). No email is hardcoded; no client-side bypass; no widening of
`customer.read`.

Tests added in `apps/web/test/runtime-authorization.test.ts` (19/19 pass):

- ADMIN + `admin.access`, no subscription → `match.detail`, `edge.full`,
  `radar.full` all allowed
- authorized FREE customer → `match.detail` still `ENTITLEMENT_REQUIRED`
- logged out → 401 `UNAUTHORIZED`
- forged cookies/headers claiming ADMIN, DB says CUSTOMER → still denied
  (cannot be spoofed client-side)
- ADMIN role **without** `admin.access` → not elevated (defence in depth)
- Account reports real plan `FREE` while `isAdmin` is true and entitlements
  include `match.detail`

## Known follow-ups spotted while working

- `apps/web/app/matches/[id]/page.tsx` renders the paywall copy with an inline
  `locale === "el" ? ... : ...` ternary instead of the `translator`, which is a
  hardcoded-string violation of the EN/EL rule (§39). To address in the
  customer redesign pass.

## Verification status

| Gate | State |
| --- | --- |
| Packages build (`turbo build --filter=./packages/*`) | PASS (14/14) |
| `runtime-authorization.test.ts` | PASS (19/19) |
| Full unit suite | PASS — 110 files, 971 tests, 0 failed, 0 skipped |
