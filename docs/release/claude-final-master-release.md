# VELYQ — Claude Final Master Release Log

Historical work state for the final release. For the 2026-09-11 release-day
continuation and its current pre-deploy state, use
[release-day-continuation-2026-09-11.md](./release-day-continuation-2026-09-11.md).
That continuation record supersedes stale status and test-count claims in this
chronological log; chat history is not a release record.

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

Full detail in [claude-final-qa-matrix.md](./claude-final-qa-matrix.md).

| Gate | State |
| --- | --- |
| Format / Lint / Typecheck | PASS / PASS / PASS (18/18) |
| Full unit suite | PASS — 111 files, 987 tests, 0 failed, 0 skipped |
| Full build (`pnpm build`) | PASS (18/18: web, admin, both workers, all packages) |
| Worker readiness | PASS |
| Fresh DB migration + integration | PASS — PostgreSQL 17 from empty, 9 files / 35 tests |
| Upgrade migration | PASS |
| Production-schema upgrade simulation | PASS |

## Scheduler and quota — audited outcome

The mandate's stated fear was that 96 scheduler wake-ups a day against a
~100-call plan is inherently unsustainable. **The architecture is sound; three
specific holes in it were not.**

What the code proves:

- Discovery and odds are **mutually exclusive within a run**, and each is capped
  at 1 request per run, so a wake-up has a **hard ceiling of one provider
  call** — the probe only fires when that count is 0.
- An idle wake-up makes **zero** provider calls: every call site sits inside a
  loop bounded by `min(purpose budget, per-run ceiling, candidate count)`, and
  with nothing due the candidate count is 0. Unit-tested.
- Due-state comes from persisted tables (`provider_ingestion_runs`,
  `provider_odds_requests`), not from timers.

Daily projection from the real constants (`DISCOVERY: 8`, `ODDS: 60`,
`LINEUP: 15`, `RESULT: 10`, `RECOVERY_RESERVE: 7`, `ASSUMED_DAILY_LIMIT: 100`):

| Scenario | Provider calls/day |
| --- | --- |
| Quiet day (no relevant fixtures) | 8 — discovery only |
| Normal football day | ~28–68 |
| Worst case, counted | **68**, leaving 32 in reserve |
| Worst case *before these fixes* | **96** — via uncounted failures and the unbounded probe |

So `*/15` is retained deliberately: the correct answer was zero-cost wake-ups,
not a slower cron. What made 96/day reachable was that failures did not deplete
the budget and the probe never consulted one. Both are now closed.

### Provider quota fixes (commit `342ba6f`)

1. **The status probe had no spend ceiling.** It is reached exactly when quota
   state is UNKNOWN, and a probe that fails — or a provider that stops sending
   `x-ratelimit-requests-remaining` — leaves it UNKNOWN, so the next wake-up
   probed again: a self-sustaining loop spending the whole plan on inspecting
   the plan. It now passes `purposeRequestBudget` like every other call.
2. **A call that threw was never counted.** `absorb()` took a null observation
   and returned. A timeout is not evidence the provider declined to serve the
   request, only that we did not read the answer, so a new
   `recordRequestAttempt` port charges it. It deliberately is **not**
   `recordQuotaObservation` with a null observation: that statement overwrites
   `remaining` unconditionally, which would erase a known-good figure and drop
   the day back to UNKNOWN — the state that causes probing. Counters advance,
   `daily_limit` is preserved, and `remaining` decays by the assumed spend,
   floored at zero.
3. **429 could not reach `RATE_LIMITED`.** The ingestion client is built with
   `retries: 0`, so a 429 returns normally and never throws, and
   `classifyProviderError` only inspects thrown errors — making the branch that
   stops the pass dead code. Worse, `fetchOdds` never inspected `body.errors`
   at all, so a refusal was recorded as a successful pass that found no prices
   and the funnel told operators "we priced it, the provider had nothing". Both
   now classify from the response.

## Product-truth fixes

| Commit | Fix |
| --- | --- |
| `cbe74b6` | Today fabricated a 1X2 distribution as `(1-p)/2` and badged it "VELYQ MODEL". The cell holding the real figure was chosen by comparing `match.selection` against "Home"/"Draw"/"Away", but the DTO carries `HOME`/`DRAW`/`AWAY` — so no comparison ever matched and **all three cells showed the invented number**, while the same page printed the true "Model 60.0%". Also deleted the dead `fairOdds * 1.03` policy and replaced the source guard's four-file list with a walk of every source under `app/`. |
| `1b71d77` | History rendered `market.football_full_time_1x2 · HOME · WAIT_FOR_LINEUP` verbatim, and `competition.name_key` was rendered raw on four surfaces. Added `marketLabel` (EN/EL) and `competitionLabel`. |
| `88a5ae7` | Retired Today's private EN/EL reason dictionary. It lacked three codes `assessDataQuality` actually emits, so a customer read "NO BOOKMAKER COVERAGE"; `reasonLabel` had the same gaps plus an English-prose fallback that shipped on Greek pages. |
| `625ec97` | The quality-grade gate was a no-op — grade F was promoted to STRONG_EDGE by a large enough edge, on evidence the quality engine had rejected. Masked only by the EXPERIMENTAL maturity downgrade, so it would have become a live P0 the moment maturity advanced. |
| `492ecdf` | Odds history ordered ascending with `LIMIT 500`, keeping the **oldest** rows, so past 500 observations `currentOdds` presented an old price as current. |

## Flaky test root-caused (section 66)

One full-suite run failed once. Cause was not a timeout:
`packages/database/test/vercel-export-regression.test.ts` spawned a real
`pnpm --filter @velyq/database... build`, rewriting `packages/database/dist`
while other test files were importing from that same directory — so it raced
whenever `dist` was genuinely stale, i.e. immediately after any edit to that
package. `pretest` already builds every package before vitest starts, so the
rebuild was redundant as well as racy; the probe that caught the original
Vercel regression is untouched. Full suite then ran 3x consecutively clean.

## Section 24 — identity invariant migration

`supabase/migrations/20260926120000_enforce_identity_invariants.sql` reviewed in
full. It is **structurally incapable** of the risks the gate is written against:

- It rewrites **no data at all** — no DELETE, no UPDATE, no relabelling. So
  affected rows = 0, expected inserts = 0, expected updates = 0, expected
  deletes = 0, ambiguous rows = 0, by construction.
- The CHECK constraint is added `NOT VALID`, so known legacy violations remain
  readable and only future writes are rejected; it is `VALIDATE`d **only** if no
  violating row exists.
- The provenance rule is a constraint trigger, which evaluates only rows written
  after it exists.
- Every step is guarded by `IF NOT EXISTS`, so it is idempotent.
- It is applied by the production-faithful upgrade simulation, which **passes**
  against the actual verified production legacy schema.

**State: NOT APPLIED.** Not because the gate failed — it passes — but because
applying it needs a production database credential that does not exist on this
machine. `VELYQ_DATABASE_URL` is a Vercel *Secret*, and Vercel correctly refuses
to disclose Secret values (`vercel env pull` returns `[SENSITIVE]`). This is a
genuine owner-only blocker for this item alone.

## Section 25 — exposed Supabase PAT

**NOT ROTATED — owner action required.** There is no Supabase CLI session on
this machine and no `SUPABASE_ACCESS_TOKEN` in the environment, so the exposed
PAT cannot be revoked from here. The token was not printed, read or used in this
session. Revoking it is a browser action in Supabase account settings
(Access Tokens), and it does not affect the database password, anon key, service
role key or JWT secret — none of which were exposed.

## Production configuration audit (section 51)

Names only; no secret value was printed or read.

Production environment (project `velyq`): `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_VELYQ_ADMIN_URL`,
`VELYQ_DATABASE_URL`, `VELYQ_APPLICATION_ORIGIN`,
`VELYQ_CUSTOMER_INTELLIGENCE_MODE`, `VELYQ_INGEST_SECRET`, `APISPORTS_KEY`,
`CRON_SECRET`. All required configuration is present.

Two findings:

1. **Deployed production is running stale code.** `GET /api/health` on
   <https://project-cf8ty.vercel.app> returns only four fields
   (`status`, `service`, `environment`, `syntheticOnly`), while this branch's
   route returns nine (`configuredDataMode`, `customerDataSource`,
   `databaseAvailable`, `syntheticFallbackAllowed`, …). The deployed build
   therefore predates the LIVE-honesty work — which is the strongest argument
   for shipping this release.
2. **Preview environment cannot represent LIVE.** `VELYQ_DATABASE_URL` exists
   in Preview only for four specific git branches, and
   `VELYQ_CUSTOMER_INTELLIGENCE_MODE` / `VELYQ_APPLICATION_ORIGIN` are not set
   for Preview at all. A preview deployment consequently defaults to LIVE with
   no database and correctly fails closed to `UNAVAILABLE` — so a preview can
   verify the build, routing, headers and EN/EL, but **cannot** verify
   real-data rendering. Adding Preview variables would be an account-settings
   change and was not made.

`syntheticOnly: true` on the current production response is **not** evidence
that production is configured synthetic: it comes from an older revision of that
route, and the mode variable is a Secret whose value cannot be read. It is
resolved by observing the new health payload after deployment.

## Public landing page — deliberate synthetic content

The production landing page renders a fixture card for
"Northbridge United v Riverside Athletic, Premier Synthetic League". This is
**intentional and documented** (`apps/web/app/page.tsx:35-39`): the public page
renders the shipped synthetic fixture through the same DTO fields the product
uses, with fictional clubs specifically so it "can never imply coverage of a
real fixture". It is not a synthetic leak into a LIVE customer read.

It is, though, a copy weakness: the card carries real product vocabulary
("Strong edge", "Wait for lineup") with **no visible "example" label** in either
language — the only signal is a competition literally named "Premier Synthetic
League". Recorded as a P2 for the customer-facing copy pass.

## Browser QA — three stacked problems behind one symptom

The Playwright customer journeys failed with Today stuck in its loading
skeleton. Three separate causes were layered, which is why the first fix
changed nothing.

### 1. Contamination introduced by this session (removed)

`vercel link` / `vercel deploy` wrote `apps/web/.env.production.local`, which
carries a real `VELYQ_DATABASE_URL`. The e2e harness starts the app with
`next start`, i.e. `NODE_ENV=production`, so **Next.js loads that file
automatically** and the app tried to reach a database it could not. Combined
with cause 3 below, every customer API hung and the shell never left its
skeleton.

An earlier conclusion in this session that the failures were "pre-existing at
`90d90c0`" was **wrong**: the baseline run was executed while that file was
already on disk, so it proved nothing. The files are deleted; they are
gitignored build artifacts and are regenerated on demand by the Vercel CLI.
Anyone reproducing this locally must delete them before running e2e.

### 2. The e2e harness requested synthetic data with a retired flag

`tooling/e2e/customer-web-server.mjs` set `VELYQ_SYNTHETIC_PREVIEW=true`.
`app/data-mode.ts` retired that flag: synthetic data now requires an exact
`VELYQ_CUSTOMER_INTELLIGENCE_MODE=SYNTHETIC_DEMO`, and `customerFixtureMode()`
is precisely `syntheticDataAllowed()`. So the harness was starting a **LIVE**
server with no database, which correctly fails closed with 503. Independently
real, and a different symptom from the hang. The unit suite already asserted
the retired flag cannot reopen synthetic mode; only the harness was stale.
`tooling/scripts/ux-preview.mjs` carried the same redundant flag alongside the
correct one, now removed.

### 3. Account was unusable without a database (product defect)

`requireCustomerSession` has a documented no-database affordance for
SYNTHETIC_DEMO; `resolveCustomerContext` never got one and returned `null`,
which `/api/v1/customer/context` turns into 503. So authorization admitted a
demo visitor as FREE and then Account could not render — in the one mode whose
entire purpose is running without a database.

`resolveCustomerContext` now mirrors the affordance under the same explicit
opt-in: the email is the identity the provider just verified, the plan is
FREE, `isAdmin` is false (administrative access is a database fact and there
is no database to assert it), and no paid entitlement is granted. **LIVE still
returns null**, so the route answers an honest 503 rather than inventing an
identity. Three tests pin it, including that the retired flag does not reopen
it.

### 4. No connection timeout on the customer read path (product defect)

`pg` defaults `connectionTimeoutMillis` to `0` — wait forever. Every
deliberate probe passed its own bound (health 3s, readiness 3s, funnel 5s,
ingest 10s), but `requireCustomerSession`, `resolveCustomerContext` and
`customerService` passed none. So an unreachable database did **not** fail
closed to an honest unavailable state as section 48 requires: it held the
request open until the platform killed it. This was reproduced locally against
an unreachable URL. `openRuntimeDatabaseSession` now applies a 5s default when
the caller does not choose one — above the liveness probe, well below any
platform function limit, so the 503 is ours to report.

### 5. The visual suite was flaky by construction

`customer-visual-review.spec.ts` screenshotted `fullPage` immediately after
navigation. Every customer route is a static shell that fetches its own data,
so navigation resolving says nothing about content: the same route captured
900px of skeleton on one attempt and 3575px of loaded content on the next, and
a full-page baseline could match neither. It now waits for
`[aria-busy="true"]` to clear — `CustomerBoundary` marks the skeleton busy —
which makes the capture deterministic and route-agnostic.

Baselines were then regenerated **and reviewed rather than accepted blindly**.
The review confirmed the Today P0 fix (one honest outcome per match,
consistent with the "Model 60.0%" shown above it) and surfaced one further
defect that would otherwise have shipped: with no reasons to show, the
strong-edge card rendered "Decision: Strong edge · Reason:" and stopped,
reading as a failed load rather than as good news. The label is now omitted
when there is nothing to list.

### Admin journey — environment prerequisite, not a defect

`tooling/e2e/admin-web-server.mjs` requires a seeded PostgreSQL at
`127.0.0.1:54322` (local Supabase). That is not provisioned on this machine —
the DB integration suite uses a separate WSL instance on 55432 which is torn
down afterwards. The admin journey is therefore **NOT RUN**, not passed, and
is not counted as green.

## Correction — the Vercel project IS Git-connected

Earlier in this session I verified push-safety on two grounds and concluded
that a `git push` "cannot trigger any Vercel deployment":

1. `vercel project inspect velyq` shows no Git Repository section.
2. Every deployment listed was attributed to CLI user `joker2faces`, never to
   a commit.

**That conclusion was wrong.** Pushing `codex/velyq-final-product-v1` produced
deployment `dpl_9jAb8PVHNgmk9enHU7iBekohdALt`, which carries the alias
`https://velyq-git-codex-velyq-final-product-v1-joker2faces-projects.vercel.app`
— Vercel's `<project>-git-<branch>-<team>` branch-alias format, which only
exists for a Git-connected project. The evidence above was consistent with my
conclusion but did not establish it.

Consequences, stated plainly:

- The earlier `backup/home-master-unique-20260909` push very likely created a
  harmless preview deployment too.
- Nothing reached production from a push: Vercel auto-deploys production only
  from the project's production branch, which this session never touched.
- Anyone repeating that safety check should confirm git linkage from a
  deployment's aliases (or the dashboard), not from `project inspect` output
  and deployment attribution.

## The accidental preview verified more than a planned one would have

Because that push-triggered deployment built from the exact release SHA, it
became the section 53 release candidate — and it verified two things that
cannot be checked locally:

1. **The build is sound on Vercel's Linux infrastructure**, Ready in ~1
   minute. That also settles the one-off local `@velyq/web#build` failure as a
   Windows/OneDrive artifact rather than a code defect.
2. **LIVE genuinely fails closed on real infrastructure.** With no database
   URL present in the Preview environment, `/api/health` reports:

   ```json
   {"configuredDataMode":"LIVE","customerDataSource":"UNAVAILABLE",
    "syntheticFallbackAllowed":false,"databaseAvailable":false,
    "syntheticOnly":false}
   ```

   No database, and it still refuses to serve the synthetic fixture. That is
   the section 48 guarantee demonstrated rather than asserted.

It also confirms the deployed artifact carries this branch's code: ten health
fields against the four the live site still served at that moment.

A preview deployment must **never** be promoted to production here, though:
Vercel builds previews with the *Preview* environment, which lacks
`VELYQ_DATABASE_URL`, `VELYQ_CUSTOMER_INTELLIGENCE_MODE` and
`VELYQ_APPLICATION_ORIGIN`. Promoting one would put production into
LIVE-with-no-database and answer 503 everywhere.

## Production deployment — DONE

| Item | Value |
| --- | --- |
| Deployed SHA | `9e28cf9c981a161800d59340f09a47a59d6839d2` |
| Production deployment ID | `dpl_DN5NhB2vPUxs9RA6bZZAJtfDAeTD` |
| Deployment URL | <https://velyq-syg863cp1-joker2faces-projects.vercel.app> |
| Customer URL | <https://project-cf8ty.vercel.app> |
| Status | ● Ready, alias confirmed pointing at this deployment |
| Rollback target | `dpl_9BdZ2QWLABcSQRfkxxe4yVeWDUvy` |
| Rollback command | `npx vercel rollback dpl_9BdZ2QWLABcSQRfkxxe4yVeWDUvy --scope team_vQN1raOYespGG8CZES6KEEtq` |

### How it was deployed, and why not the obvious way

Three `vercel deploy` attempts (with and without `--archive=tgz`) uploaded
successfully, reported "Building…", and then sat at status `UNKNOWN` with no
build logs indefinitely. Provenance shows why that was not a code or flag
problem: every successful deployment in this project's recent history is
**git-triggered** and completes in ~1 minute, while CLI-uploaded builds are
currently not being picked up. (CLI `--prod` did work 22h earlier, so this
looks like transient Vercel-side degradation of the CLI upload path.)

The working route was:

```
npx vercel redeploy dpl_9jAb8PVHNgmk9enHU7iBekohdALt --target production --no-wait
```

`redeploy` **rebuilds** an existing deployment from its git source, and
`--target production` rebuilds it with the **Production** environment. That
distinction is the whole point: simply promoting the preview would have kept
*Preview* environment variables, which lack `VELYQ_DATABASE_URL`,
`VELYQ_CUSTOMER_INTELLIGENCE_MODE` and `VELYQ_APPLICATION_ORIGIN`, and would
have put production into LIVE-with-no-database and answered 503 everywhere.

Throughout every stalled attempt the live alias stayed on the previous
deployment: Vercel re-points it only on a successful build, so no customer
was affected by any of it.

### Production verification (section 55)

`/api/health` — the question that had been open all session is now settled:

```json
{"environment":"production","configuredDataMode":"LIVE",
 "effectiveCustomerDataMode":"LIVE","customerDataSource":"DATABASE",
 "syntheticFallbackAllowed":false,"databaseAvailable":true,
 "syntheticOnly":false}
```

Ten fields where the old build served four, `customerDataSource: "DATABASE"`
(a real connection, not the fixture), and `syntheticFallbackAllowed: false`.
The previous `syntheticOnly: true` was stale code, exactly as diagnosed — not
a synthetic misconfiguration.

`/api/ready`: `authConfigured: true`, `databaseConfigured: true`,
`databaseSource: "node"`.

| Route | Result |
| --- | --- |
| `/`, `/today`, `/edge`, `/radar`, `/results`, `/account`, `/pricing`, `/sign-in` | all HTTP 200, 0.33–0.58s |
| `/api/v1/today` unauthenticated | HTTP 401 — correctly refused |
| Synthetic markers on authenticated shells | **none** |
| Synthetic markers on `/` | 2 — the deliberate marketing preview with fictional clubs |

Security headers on an authenticated route: CSP (`default-src 'self'`,
`base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`,
`object-src 'none'`), HSTS `max-age=31536000; includeSubDomains`,
`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`
locking camera/microphone/geolocation, and
`Cache-Control: private, no-cache, no-store`.

EN and EL both verified. Greek public routes (`/el`, `/el/pricing`,
`/el/sign-in`) serve Greek; the authenticated shells serve Greek from the
`velyq-locale` cookie (270 Greek terms each — Σήμερα, Ιστορικό, Λογαριασμός,
Αποσύνδεση, Πειραματικό). `/el/today` returning 404 is **correct by design**:
`app/locale-path.ts` gives `/el` variants only to the ten prerendered public
routes and deliberately does not invent `/el` URLs for server-rendered
authenticated routes, which read the cookie instead.

### What production verification could NOT cover

**Authenticated customer and admin surfaces were not exercised against
production.** Doing so needs the owner's credentials, which must not be
requested or handled here. So:

- Match Intelligence admin access is verified by six unit tests and by the
  server-authoritative logic, and by the local browser journeys — **not** by a
  real production session.
- Real production data rendering on `/today`, `/edge`, `/radar`, History and
  match detail is **unverified**; only the unauthenticated shells, headers,
  health and readiness were checked.

The one owner check worth doing first: sign in and open Match Intelligence on
a real fixture. It must show the full analysis, not "available on ELITE".

## `--archive=tgz` deployments hang for this project

Both deployments that stalled indefinitely at status `UNKNOWN` with no build
logs used `--archive=tgz`:

| Deployment | Flag | Outcome |
| --- | --- | --- |
| `dpl_3A1jB1kfNMNNye7ijVYDzUNSa5hk` (preview) | `--archive=tgz` | UNKNOWN, ~48 min, no logs |
| `dpl_EgyJvxmSdEygqSoA3fPniXu18J9X` (production) | `--archive=tgz` | UNKNOWN, no logs |
| `dpl_9jAb8PVHNgmk9enHU7iBekohdALt` (preview, git-triggered) | none | **Ready in ~1 min** |

Every completed deployment in this project's history — including all the
older CLI ones — was made without that flag. **Do not use `--archive=tgz`
here.** The upload completes and reports "Building…", then the build never
starts or never reports.

## Vercel preview — stalled, inconclusive

A preview of the candidate was deployed (`dpl_3A1jB1kfNMNNye7ijVYDzUNSa5hk`,
`velyq-cmjydx8rf`). The 3.8MB upload completed and the build began, but the
deployment sat at status `UNKNOWN` with its interstitial reporting `BUILDING`
for ~48 minutes against a normal ~2 minutes for this project, producing no
build logs. Treated as **stalled and inconclusive**; the local status poller
was stopped, which does not cancel the remote deployment.

It would have been a weak gate regardless: `VELYQ_DATABASE_URL` exists in
Preview only for four specific git branches, and
`VELYQ_CUSTOMER_INTELLIGENCE_MODE` / `VELYQ_APPLICATION_ORIGIN` are unset for
Preview, so a preview defaults to LIVE with no database and correctly fails
closed. It can verify a build, routing and headers — never real-data
rendering. Making previews LIVE-representative would mean adding Preview
environment variables, an account-settings change that was not made.

Note for deployment safety: Vercel re-points the production alias only on a
successful build, so a stalled or failed production build leaves the live site
serving its current deployment.

## Known follow-ups (not closed)

Honest list of what remains, with severity.

| Severity | Item |
| --- | --- |
| P1 | **Lineup and result ingestion do not exist.** `provider-quota` allocates `LINEUP: 15` and `RESULT: 10` per day, and counter columns exist, but there is no fetch port, no due predicate and no call site anywhere. So 25 requests/day of budget are permanently idle while `ODDS` is capped at 60, `WAIT_FOR_LINEUP` can never clear from live data, and nothing settles from live results. Either implement both or re-allocate the budget so the policy stops describing capability the code lacks. |
| P1 | **A failed discovery marks the date fresh for 6 hours.** `discoveryDatesRequested` records attempts, and the adapter reads it as the freshness marker, so one rejected fixture-list request suppresses re-discovery of that date for `DISCOVERY_FRESH_FOR_MINUTES = 360`. Needs attempts and successes recorded separately. Note the interaction with the attempt counter added in `342ba6f`. |
| P2 | `providerObservedAt: String(item["update"] ?? ingestedAt)` stamps *our* fetch time when the provider omits `update`, so a price of unknown age reports `CURRENT` and `actionable`. The honest fix is a nullable provider timestamp treated as `UNAVAILABLE`, which is a schema change and was judged too invasive to make late in a release. |
| P2 | Odds writer does ~7–10 database round trips **per observation**, each in its own transaction (~12s for one fixture), which is why `MAX_BOOKMAKERS_PER_FIXTURE` is capped at 6. Batching to ~8 round trips per fixture looks feasible while preserving idempotency, provenance and constraint targets; the cap should not be raised before that. |
| P2 | Only `FOOTBALL_FULL_TIME_1X2` is wired end to end. Over/Under 2.5 is supported by the provider parse, canonical semantics, contracts, model and settlement, but the writer hardcodes one market (`WIRED_ODDS_MARKET`) and has no `lineValue` handling, so it stops there with `MARKET_NOT_WIRED`. |
| P2 | `customer-database.ts` prefers market code `"MATCH_RESULT"` or `"1X2"`, but the writer creates `FOOTBALL_FULL_TIME_1X2` (`MATCH_RESULT` is its *family* code). It works today only via the fallback, and would become non-deterministic the moment a second market is wired. |
| P2 | Four freshness states collapse to two on the DTO (`"FRESH" | "STALE"`), so an `AGING` price (46–180 min) displays as "Out of date" and is indistinguishable from a 27-hour-old one. |
| P2 | The quality policy's freshness component is dead: the forecast-cycle adapter passes `receivedAt: asOf`, so age is always 0, `STALE_DATA` is never emitted and `decideRecommendation`'s `STALE_DATA -> WAIT` branch is unreachable. Four of seven weighted components always score full marks. Freshness is still enforced correctly upstream on `providerObservedAt`; the published *score* just claims to measure more than it does. |
| P2 | Hardcoded `locale === "el"` copy blocks remain in `today-view.tsx` (an 11-key object), `results-view.tsx` (a 12-key object plus two inline label functions), `customer-shell.tsx` (a nav item) and `matches/[id]/page.tsx` (the paywall copy). These bypass the `Record<MessageKey, string>` exhaustiveness check that guarantees Greek coverage. |
| P2 | `footerCreatedBy` is untranslated in the Greek message table. |
| P2 | The landing-page preview needs an explicit "example" label (see above). |
| P2 | `supabase/operations/provider-ingest-cron.sql` posts to `velyq-admin-staging.vercel.app` and lives outside `supabase/migrations`, so the repository cannot prove what the live project actually schedules. Worth confirming with `select * from cron.job where jobname = 'velyq-provider-ingest'`. |

