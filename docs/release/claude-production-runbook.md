# VELYQ — Production Runbook

Operational reference for deploying, verifying and recovering the customer
application. Written so the next engineer can act without this chat history.

---

## 1. Identity of the production system

| Item | Value |
| --- | --- |
| Customer URL | <https://project-cf8ty.vercel.app> |
| Vercel project | `velyq` |
| Project ID | `prj_XeLstdKUMp5q3erxVFyO3Oh8xSvs` |
| Team / org ID | `team_vQN1raOYespGG8CZES6KEEtq` |
| Root directory | `apps/web` |
| Framework | Next.js, Node 24.x |
| Admin project | `velyq-admin-staging` |
| Repository | <https://github.com/Joker2faces/velyq> |
| Release branch | `codex/velyq-final-product-v1` |

**Verify project identity before every production deployment.** Never create a
new Vercel project. `npx vercel project ls` must show `velyq` mapped to
`project-cf8ty.vercel.app`.

The project **is connected to GitHub**. A push to a branch produces a *preview*
deployment carrying a git-branch alias
(`velyq-git-<branch>-joker2faces-projects.vercel.app`). Production is deployed
only from the project's production branch or explicitly via the CLI.

---

## 2. Deploying

### The route that works

CLI *uploads* have been observed to stall indefinitely at status `UNKNOWN` with
no build logs — both with and without `--archive=tgz`. Every deployment that
has succeeded recently was built from git source. The reliable route is
therefore to push, let the git integration build a preview, then **rebuild that
deployment into production**:

```bash
git push origin codex/velyq-final-product-v1
# wait for the preview to reach Ready (about 1 minute), find its id:
npx vercel ls velyq
npx vercel redeploy <preview-deployment-id> --target production --no-wait
```

`redeploy` rebuilds from the same source **with the Production environment**,
which is the critical difference.

### Never promote a preview

Vercel builds previews with the **Preview** environment, which does not have
`VELYQ_DATABASE_URL`, `VELYQ_CUSTOMER_INTELLIGENCE_MODE` or
`VELYQ_APPLICATION_ORIGIN`. Promoting a preview to production would put the
customer app into LIVE-with-no-database and answer 503 on every surface. Always
`redeploy --target production`; never "Promote to Production" on a preview.

### Deployment is fail-safe

Vercel re-points the production alias only on a **successful** build. A stalled
or failed deployment leaves the live site serving its current deployment, so a
failed attempt is not an outage.

### Daily deployment cap (free plan)

`vercel redeploy ... --target production` can return `402 Resource is
limited - try again in 24 hours (more than 100, code:
"api-deployments-free-per-day")` once the account's Vercel deployments for
the day (across preview and production, both projects) hit 100. This is a
genuine platform quota, not a bug -- confirmed by two retries a few minutes
apart both returning the identical error. There is no owner-side override
available on the free plan short of upgrading it, and creating a second
Vercel project to route around it is explicitly out of scope (§ "Production
safety": never create another Vercel project). When hit: keep implementing,
testing, committing and pushing increments (all durable on
`codex/velyq-final-product-v1` regardless of deploy state) and resume
`vercel redeploy` once ~24h has passed since the cap was hit -- check with a
harmless dry run (`vercel ls`) first, since the exact reset time is a
rolling window, not a fixed clock boundary. Hit at 2026-09-10 ~20:40 EEST
during this session, after the Market Consensus/Market Map/Risk Flags
increment (code `aaf8a80`) built and pushed successfully but could not be
promoted to production.

### GitHub Actions is billing-locked (blocks the real-PostgreSQL CI gate)

The `db-integration` CI job (`.github/workflows/ci.yml`) is the only environment
in this project that runs a genuine PostgreSQL 17 (via the Supabase CLI, which
manages its own Docker containers on the Ubuntu runner) -- no local Postgres
or Docker is available in the engineering environment this session ran in.
`gh workflow run ci.yml --ref codex/velyq-final-product-v1` was dispatched to
get real-database verification of the session's DB-facing changes (the
`getOddsHistory` bound-query fix, the CLV write path, the multi-class
calibration query). Every job failed to start with the identical annotation:
**"The job was not started because your account is locked due to a billing
issue."** This is a genuine, external account-level block, confirmed
immediately and consistently across all 12 jobs in the run
(https://github.com/Joker2faces/velyq/actions/runs/34527023380) -- not a
flake, not something a retry fixes, and not an engineering-side problem.
There is no owner-side override available from this session (billing issues
require the account owner to resolve them with GitHub directly).

**Do not repeatedly re-dispatch this workflow while the account remains
billing-locked** -- same principle as the Vercel deployment cap: it wastes
engineering time on an external blocker rather than advancing anything. When
the owner confirms the billing issue is resolved, re-dispatch once
(`gh workflow run ci.yml --ref codex/velyq-final-product-v1`) and let the
`db-integration` job run to completion before drawing any conclusion.

**Practical consequence**: every DB-facing change queued on
`codex/velyq-final-product-v1` remains **PUSHED AND UNIT-TESTED, NOT
PRODUCTION-VERIFIED against real Postgres** until either local Docker/Postgres
becomes available in the engineering environment, or the GitHub Actions
billing lock clears and the `db-integration` job runs green. This specifically
includes: the `getOddsHistory` bounded-query rewrite, the `ingestFootballResults`
CLV write path, the multi-class calibration query, and the Market Consensus
snapshot queries. None of these should be described as "release-verified" in
any status report until this gate actually runs.

---

## 3. Rollback

Record before every deploy:

```bash
# current production deployment id -- this is the rollback target
npx vercel inspect https://project-cf8ty.vercel.app | grep -E "^\s+(id|url)"
```

To roll back:

```bash
npx vercel rollback <previous-deployment-id> --scope team_vQN1raOYespGG8CZES6KEEtq
```

Known-good deployments:

| Deployment | Note |
| --- | --- |
| `dpl_7t7yewrjKTWtFGSdeqcag2aazQFB` | **Current.** Post-match autopsy: `listDecisionsForEvent` (same join chain as `listDecisions`, scoped by event instead of STRONG_EDGE status) + `loadPostMatchAutopsy()` -- Match Intelligence now shows a "Post-match autopsy" card once a fixture has settled: final score, price at decision vs. closing price, CLV, and stored why-not reason codes per decision. Null (no card) for any unsettled fixture -- the honest common case (code `2ab1cfb`). Deployed 2026-09-10 20:10 EEST. Verified: health `LIVE`/`DATABASE`, six routes 200, zero synthetic markers. |
| `dpl_2m4sKDFp49auvUJHMCgu8ESfL15w` | Average CLV: `trackRecord()` (packages/analytics) had no caller anywhere -- same unwired-but-tested pattern as the earlier `marketConsensus()` discovery. Added `averageClv` to its return, wired into Results as a fifth stat alongside the existing "N/M positive CLV" ratio (code `4998ae2`). Deployed 2026-09-10 19:56 EEST. Verified: health `LIVE`/`DATABASE`, five routes 200, zero synthetic markers. |
| `dpl_2fEKHbw9FCB9PR5ouUhXKqqCSxja` (web) + admin `dpl_ANVQxnN4e2GVKnnCbZQLF28TdvMb` | Future-data-leakage fix: `computeLineupState` had no upper time bound -- a cycle run against a historical `asOf` could read a lineup sheet confirmed after that moment (or after kickoff) and price against it. `getLineupState` now takes `asOf`; the adapter filters `receivedAt <= asOf`. Odds reads were already correctly bounded; no `event_results`/`market_settlements` self-reference exists in the forecast/decision path (code `cb306fd`). Deployed 2026-09-10 19:45 EEST. Verified: web health `LIVE`/`DATABASE`, eight routes 200, zero synthetic markers; admin health `production`, `/intelligence` 200. |
| admin `dpl_AX2CmLfwG1iq5ipXNA7JUUdxjDf1` | Provider quota observability: `getQuotaSnapshot()` reads the existing `provider_quota_state` table (no migration); the intelligence dashboard shows a "Provider quota" panel (policy state, remaining/daily limit, per-purpose call counts, last call time) per provider/day (code `1c834c8`). Deployed 2026-09-10 19:37 EEST. Verified: admin health `production`, `/intelligence` 200. |
| `dpl_4koDzmo2Sb9A18J6JYyqm5BAU6PZ` | Accessibility fixes: `aria-live="polite"` on the Results list so "Load older decisions" is announced to screen readers; `aria-hidden="true"` on Badge's decorative dot span (code `713b274`). Audit found the app otherwise already in strong shape (real buttons, labeled forms, no bare `&lt;img&gt;`, correct heading hierarchy, dynamic `&lt;html lang&gt;`). Deployed 2026-09-10 19:28 EEST. Verified: health `LIVE`/`DATABASE`, eleven routes 200, zero synthetic markers. |
| `dpl_DdChMtnTju962NeaHTCtJVDcJd4e` | History cursor pagination: `listDecisions` accepts a keyset cursor `{createdAt, id}` instead of a fixed 500-row cap; `/api/v1/history` reads `?cursor=&limit=` and returns `{hasMore, nextCursor}`; Results renders a "Load older decisions" control (code `7e26cea`). Deployed 2026-09-10 19:14 EEST. Verified: health `LIVE`/`DATABASE`, eleven routes 200 (incl. `/results`), zero synthetic markers. |
| `dpl_8N3FWpMh2Zaqm953A17Q4bpx7BFg` | "Why nothing today?": `CustomerTodayDto.summary` (totalFixtures, counts by recommendation, lineupGated) computed once in `mapToday` from the same fixture list Today already maps -- no second query, internal funnel-diagnostic route untouched. Today's empty state now cites it ("N fixtures today, M priced, K cleared EDGE") instead of a stock sentence (code `a7b5f6d`). Deployed 2026-09-10 19:02 EEST. Verified: health `LIVE`/`DATABASE`, ten routes 200, zero synthetic markers. |
| `dpl_AAfbexLWHGqL4tgthFKDim9HcsA2` (web) + admin `dpl_DTvzNGdXxYp8RF6z9xVvCRkKALwm` | Lineup-triggered forecast recompute: `ingestFootballLineups` now reports which event ids received a genuinely new observation; `runProviderIngestion` surfaces the list; the admin `provider-ingest` route calls `runForecastCycle` for exactly those events in the same request (`eventIds` is a new optional filter on `loadEligibleFixtures`, the daily cron path unchanged) — closes the gap where a lineup landing between kickoff-90min and the next 04:00 cron got no forecast at all (code `a47b954`). `CHANGED` lineup-status detection investigated and deliberately not implemented — blocked on the same production-migration credential as P0-F (`lineup_observations_status_check` only allows EXPECTED/OFFICIAL/UNAVAILABLE today). Deployed 2026-09-10 18:41 EEST. Verified: web health `LIVE`/`DATABASE`, ten routes 200, zero synthetic markers; admin health `production`/`syntheticOnly:true` (unchanged from before this deploy), 200 on `/`. |
| `dpl_D9xaExEgRyDM5uEFXXtzHorVxmzW` | Best-of-N bookmaker count: `currentOdds` was already the best price across every bookmaker at the latest instant (`bestAt()`), this makes it legible — `summariseOddsMovement` now returns `bookmakerCount`, threaded onto `CustomerMatchDto.bookmakerCount?` and shown as a "Best of N books" caption on Match Intelligence's price-validity card (code `6cde8f8`). Deployed 2026-09-10 18:21 EEST. Verified: health `LIVE`/`DATABASE`, ten routes 200 (`/matches/1` 307 as designed, unauth), six security headers, zero synthetic markers on `/today`. |
| `dpl_2KKg9NjxHCeK123N3zoQKZFUY8Y8` | FT Over/Under 2.5 customer-facing surfacing: Match Intelligence "Other markets" card, History label fix (OVER/UNDER were rendering as "—"), Today/EDGE "Also EDGE" indicator (code `0c110f0`). **Rollback target.** Deployed 2026-09-10 18:06 EEST. Verified: health `LIVE`/`DATABASE`, ten routes 200, seven security headers, `/el` 4376 Greek words, zero synthetic markers. |
| `dpl_868qdtrBep1XFGCwWs7SK337F7nM` | O/U 2.5 forecast/decision pipeline (code `6d75375`). **Rollback target.** FT Over/Under 2.5 forecast/decision pipeline: real Dixon-Coles model probability, forecast, decision, ready to settle (code `6d75375`). Deployed 2026-09-10 17:12 EEST. Verified: health `LIVE`/`DATABASE`, ten routes 200 with `/api/v1/today` 401, seven security headers, `/el` 4376 Greek words, zero synthetic markers on `/today`. No customer-facing change -- the customer read path still shows only the match-result outcome per fixture. |
| `dpl_4UbktAQmzZuLjLfazGQ6tEnTcV7V` | Freshness honesty and whole-day quota simulation (code `5298c59`). **Rollback target.** Freshness honesty (provider timestamp, live staleness gate, four-state DTO) and the whole-day quota simulations (code `5298c59`). Deployed 2026-09-10 15:46 EEST. Verified: health `LIVE`/`DATABASE`, ten routes 200 with `/api/v1/today` 401, seven security headers, `/el` 4376 Greek words, zero synthetic markers on `/today` |
| `dpl_Dg4334QCQYXg3qXS5Fcvayoqjjof` | O/U 2.5 writer, batched odds path, lineup ingestion, authorization and caching fixes (code `e63f287`). **Rollback target.** O/U 2.5 writer + batched odds path + lineup ingestion + the authorization and caching fixes (code `e63f287`). Deployed 2026-09-10 15:09 EEST. Verified: health `LIVE`/`DATABASE`, ten routes 200 with `/api/v1/today` 401, seven security headers, `private, no-store` now present on `/api/v1/billing/projection` (which previously had no `Cache-Control` at all), `/el` 4382 Greek words, `/el/today` 404 as designed, zero synthetic markers on `/today` |
| `dpl_AdFxgRiWsFg29UQCnhGHyaKPWU6X` | Result ingestion and settlement (code `f2ece99`). **Rollback target.** Result ingestion and settlement, plus catalog-sourced customer copy (code `f2ece99`). Deployed 2026-09-10 10:04 EEST from preview `dpl_J81XywiAGsD7nx2KmCzz93EHKD2E`. Verified after deploy: health `LIVE`/`DATABASE`, ten routes 200 with `/api/v1/today` 401, all seven security headers, `/el` 4382 Greek words and the cookie locale 494 on the shell, the new catalog-sourced Greek nav label present, `/el/today` 404 as designed, zero synthetic markers on `/today`, and no `"Fair price"` regression on History |
| `dpl_6jgtVJEcQkvkmZiGZYMGauaNejJe` | Match Intelligence price-validity increment (code `568496c`). **Rollback target.** Match Intelligence price-validity + decision-reasoning increment (code `568496c`). Deployed 2026-09-10 07:51 EEST by `vercel redeploy dpl_5CsYcBdXwykrEStnBBSke9Q5LSmW --target production`. Verified after deploy: health `LIVE`/`DATABASE`, all 10 routes 200 with `/api/v1/today` 401, seven security headers present, `/el` 4367 Greek words and cookie-locale `/today` 489, `/el/today` 404 as designed, zero synthetic markers on `/today`, and `match-card` / `validity__scale` / `reasoning__list` present in the served stylesheet |
| `dpl_CTjZTQuridUZMtytpgxP7gAJFW3V` | Customer redesign increment (code `4d04fbf`) — match cards, Today restructure, EDGE segmentation, RADAR evidence depth |
| `dpl_DN5NhB2vPUxs9RA6bZZAJtfDAeTD` | Release of the honesty/quota fixes (code `9e28cf9`) |
| `dpl_9BdZ2QWLABcSQRfkxxe4yVeWDUvy` | Predecessor; predates every fix in that release |

---

## 4. Post-deploy verification

Run all of it. Deployment is not completion.

```bash
# 1. Health must report LIVE against a real database
curl -s https://project-cf8ty.vercel.app/api/health
```

Expected, and the single most important check:

```json
{"environment":"production","configuredDataMode":"LIVE",
 "effectiveCustomerDataMode":"LIVE","customerDataSource":"DATABASE",
 "syntheticFallbackAllowed":false,"databaseAvailable":true,
 "syntheticOnly":false}
```

`customerDataSource` must be `DATABASE`. If it is `UNAVAILABLE`, the database
is unreachable and the app is correctly failing closed — it is **not** serving
synthetic football, but customers see an unavailable state. Check
`VELYQ_DATABASE_URL` and the database's own health.

A four-field response (`status`, `service`, `environment`, `syntheticOnly`
only) means an **old build** is live.

```bash
# 2. Readiness
curl -s https://project-cf8ty.vercel.app/api/ready

# 3. Routes: all 200, and /api/v1/today must be 401 unauthenticated
for p in / /today /edge /radar /results /account /pricing /sign-in /api/ready /api/v1/today; do
  printf "%-16s " "$p"
  curl -s -o /dev/null -w "%{http_code} %{time_total}s\n" "https://project-cf8ty.vercel.app$p"
done

# 4. Security headers on an authenticated route
curl -s -D - -o /dev/null https://project-cf8ty.vercel.app/today | \
  grep -iE "content-security-policy|strict-transport|x-frame|x-content-type|referrer-policy|permissions-policy|cache-control"

# 5. Greek. Public routes are prefixed; authenticated routes use the cookie.
curl -s https://project-cf8ty.vercel.app/el | grep -c "[Α-Ωα-ω]"
curl -s -H "Cookie: velyq-locale=el" https://project-cf8ty.vercel.app/today | grep -c "[Α-Ωα-ω]"
```

**`/el/today` returning 404 is correct.** `app/locale-path.ts` gives `/el`
variants only to the ten prerendered public routes; authenticated routes are
server-rendered and read the `velyq-locale` cookie instead.

No authenticated surface may contain synthetic markers:

```bash
curl -s https://project-cf8ty.vercel.app/today | grep -cE "Northbridge|Premier Synthetic"   # must be 0
```

The public landing page **does** contain them by design — it renders the
shipped synthetic fixture with fictional clubs so it can never imply coverage
of a real match.

---

## 5. Local development and verification

```bash
export PATH="/c/Users/thodo/.npm-global:$PATH"   # pnpm lives here (corepack's
                                                 # global shim needs admin)
cd C:/Users/thodo/velyq-release                  # worktree OUTSIDE OneDrive
```

| Gate | Command |
| --- | --- |
| Format | `pnpm format` |
| Lint | `pnpm lint` |
| Typecheck | `pnpm typecheck` |
| Unit + integration | `pnpm test` |
| Full build | `pnpm build` |
| Worker readiness | `pnpm worker:verify` |
| Fresh DB migration + integration | `pnpm test:db:local` |
| Upgrade migration | `pnpm test:db:upgrade` |
| Production-schema simulation | `pnpm test:db:production-upgrade` |
| Customer browser journeys | `pnpm test:e2e --project=customer` |
| Admin browser journey | `pnpm test:e2e:admin` |

The database suites run PostgreSQL 17 inside WSL `Ubuntu-24.04` on port 55432,
provisioned and torn down by the scripts. `pnpm test:e2e:admin` provisions its
own seeded database; the customer project deliberately needs none because it
runs on the synthetic corpus.

### Two environment traps

1. **`vercel link` / `vercel deploy` write `apps/web/.env.production.local`,
   and `next start` loads it.** That file carries a real `VELYQ_DATABASE_URL`,
   so the e2e harness will try to reach a database it cannot use and every
   customer API will hang. Delete `.env*.local` before running e2e locally.
2. **A killed build leaves a truncated `.next` artifact** which then fails
   typecheck with `TS1127: Invalid character` in
   `.next/types/root-params.d.ts`. Fix with `rm -rf apps/*/.next`.

---

## 6. The data pipeline

```
Supabase Cron (*/15)
  -> POST apps/admin /api/internal/provider-ingest
    -> runProviderIngestion (packages/application/src/provider-ingestion.ts)
      -> API-Sports (packages/providers/src/apisports.ts)
        -> normalization + identity + writers (packages/database)
          -> PostgreSQL
            -> customer read path (apps/web)
```

### Quota invariants — do not break these

- **One provider call per scheduler wake-up, maximum.** Discovery and odds are
  mutually exclusive per run and each capped at one request.
- **An idle wake-up makes zero calls.** Every call site sits inside a loop
  bounded by `min(purpose budget, per-run ceiling, candidate count)`.
- Due-state comes from persisted tables (`provider_ingestion_runs`,
  `provider_odds_requests`), never from timers.
- A call that returns nothing usable is still charged, via
  `recordRequestAttempt` — otherwise a failing provider makes the daily budgets
  inoperative.

Budgets (`packages/application/src/provider-quota.ts`): `DISCOVERY 8`,
`ODDS 60`, `LINEUP 15`, `RESULT 10`, `RECOVERY_RESERVE 7`, assumed daily limit
100.

Measured by whole-day simulation, not estimated:
`packages/application/test/provider-quota-simulation.test.ts` runs the real
orchestrator over all 96 wake-ups with in-memory ports, carrying quota state
forward the way the database does. Deterministic across repeated runs.

| Scenario | Calls/day | Idle wake-ups | Remaining | Breakdown |
| --- | --- | --- | --- | --- |
| Quiet day | **0** | 96 of 96 | 100 | nothing due |
| Normal football day | **30** | 66 of 96 | 70 | D 2, O 9, L 9, R 10 |
| Heavy day | **93** | 3 of 96 | 7 | D 8, O 60, L 15, R 10 |
| Worst case | **93** | 3 of 96 | **7** | every purpose at its budget |

The worst case spends exactly the allocated total and ends with exactly the
reserve — not approximately, which is what makes the reserve a guarantee
rather than a hope. A heavy day is bounded by the purpose budgets rather than
by the cadence, and the per-run ceiling of one call per wake-up bounds it
again at 96 regardless.

`LINEUP`'s budget is currently **unused** — no fetch port exists for it. See
the completion backlog.

`RESULT` is now wired. It runs only on a wake-up where neither discovery nor
odds spent a request, asks at most once per pass, and covers up to twenty
fixtures in that one request via `/fixtures?ids=`. A fixture is asked about
135 minutes after kickoff, re-asked every 30 minutes while unfinished, never
asked again once FINAL/CANCELLED/ABANDONED, and abandoned after 72 hours. The
marker is `operations.provider_result_requests`.

To see what the result pass is doing:

```sql
select started_at, result_candidates, result_requests_attempted,
       results_written, settlements_written, skipped_by_reason
from operations.provider_ingestion_runs
order by started_at desc limit 20;
```

**The first live result pass is worth watching.** The endpoint shape and its
twenty-id ceiling come from the provider's documentation, not from an observed
response. A `RESULT_REJECTED` in `errors_by_reason` means the `ids` parameter
was refused; the fix is the parameter, not the budget.

### Checking the scheduler

The cron is defined in `supabase/operations/provider-ingest-cron.sql`, which is
deliberately **not** a migration — so the repository cannot prove what the live
project schedules. Confirm with:

```sql
select * from cron.job where jobname = 'velyq-provider-ingest';
```

Note that file targets `velyq-admin-staging.vercel.app`.

---

## 7. Secrets

Never print values. Production environment variable **names**:

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
`NEXT_PUBLIC_VELYQ_ADMIN_URL`, `VELYQ_DATABASE_URL`,
`VELYQ_APPLICATION_ORIGIN`, `VELYQ_CUSTOMER_INTELLIGENCE_MODE`,
`VELYQ_INGEST_SECRET`, `APISPORTS_KEY`, `CRON_SECRET`.

Vercel refuses to disclose Secret-typed values (`vercel env pull` writes
`[SENSITIVE]`), so their effective values can only be confirmed by observed
behaviour — which is what `/api/health` is for.

**Outstanding:** a Supabase Personal Access Token was exposed in an earlier
transcript and must be treated as compromised. Revoke at Supabase → Account →
Access Tokens. This does not affect the database password, anon key, service
role key or JWT secret, none of which were exposed.

---

## 8. Protected lines

Do not modify `main`, `integration/phase-1`, or PR #3. Do not delete branches.
Do not alter the canonical Cloudflare deployment `velyq-poc`. The preserved
pre-existing lineage is `backup/home-master-unique-20260909` (`3a5f0cb`) plus a
bundle at `C:\Users\thodo\velyq-backups\velyq-home-master-unique-20260909.bundle`.
