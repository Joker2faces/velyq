# VELYQ — Claude Final QA Matrix

Verification state for the release built from `codex/velyq-final-product-v1`.
Every PASS below was observed in this session, on this machine, at the SHA noted
in the master release log. Anything not observed says so.

## Automated gates

| Gate | Result | Evidence |
| --- | --- | --- |
| Prettier (`pnpm format`) | **PASS** | all matched files use Prettier code style |
| ESLint (`pnpm lint`, `--max-warnings 0`) | **PASS** | clean |
| Typecheck (`pnpm typecheck`) | **PASS** | turbo 18/18 successful |
| Unit + integration suite (`pnpm test`) | **PASS** | 111 files, 987 tests, 0 failed, 0 skipped |
| Package builds | **PASS** | 14/14 |
| Full build (`pnpm build`) | **PASS** | 18/18 — includes `@velyq/web`, `@velyq/admin`, both workers |
| Worker readiness (`pnpm worker:verify`) | **PASS** | "Worker readiness: PASS" |
| Fresh-database migration + DB integration (`pnpm test:db:local`) | **PASS** | PostgreSQL 17 in WSL, from empty: 9 files, 35 tests |
| Upgrade migration (`pnpm test:db:upgrade`) | **PASS** | representative upgrade path, data preserved |
| Production-schema upgrade simulation (`pnpm test:db:production-upgrade`) | **PASS** | release migrations applied on top of the ACTUAL verified production legacy schema; data preserved; new columns backfilled deterministically; provenance trigger enabled |
| Flake check | **PASS** | full suite run 3x consecutively clean after root-causing the one failure seen |

### Test-suite discovery (section 45)

`tooling/vitest/vitest.config.mts` is the single unit config and collects 111
files across `apps/*`, `packages/*`, `workers/*` and `tooling/*`. Database
integration runs from its own config against real PostgreSQL 17. No suite was
excluded or skipped to obtain a green run.

## P0 / P1 closed this session

| ID | Severity | Area | Issue | State |
| --- | --- | --- | --- | --- |
| P0-1 | P0 | Authorization | ADMIN/OWNER saw the ELITE paywall on Match Intelligence | **CLOSED** |
| P0-2 | P0 | Quota | Status probe was the one provider call with no budget check; a failing probe or a missing quota header made it re-probe every wake-up (96/day against a ~100-call plan) | **CLOSED** |
| P0-3 | P0 | Today | View fabricated a 1X2 distribution as `(1-p)/2` and attributed it to the model; comparisons against display strings meant all three cells showed the invented figure | **CLOSED** |
| P1-1 | P1 | Quota | A provider call that threw was never counted, so daily budgets never depleted and the cadence became the only bound | **CLOSED** |
| P1-2 | P1 | Quota | 429 could not reach `RATE_LIMITED` (client built with `retries: 0` never throws), so the branch that stops the pass was dead code | **CLOSED** |
| P1-3 | P1 | Quota | `fetchOdds` never inspected `body.errors`, so a refused request was recorded as a successful pass with no prices | **CLOSED** |
| P1-4 | P1 | Math | Dead `fairOdds * 1.03` policy still exported in `forecast-presentation.ts`, outside the source guard's file list | **CLOSED** |
| P1-5 | P1 | Vocabulary | History rendered `market.football_full_time_1x2 · HOME · WAIT_FOR_LINEUP` verbatim | **CLOSED** |
| P1-6 | P1 | Vocabulary | `competition.name_key` rendered raw on Today, match detail, landing page and History | **CLOSED** |
| P1-7 | P1 | Vocabulary / i18n | Unmapped reason codes printed as `NO BOOKMAKER COVERAGE`; `reasonLabel` served English prose on Greek pages | **CLOSED** |
| P1-8 | P1 | Decision engine | Quality-grade gate was a no-op: grade F promoted to STRONG_EDGE by a large edge (masked only by the EXPERIMENTAL maturity downgrade) | **CLOSED** |
| P1-9 | P1 | Freshness | Odds history kept the oldest 500 rows, so `currentOdds` could present an old price as current | **CLOSED** |
| P1-10 | P1 | Test integrity | `vercel-export-regression` ran a real `pnpm build` mid-suite, rewriting `packages/database/dist` while other files imported it | **CLOSED** |

## Product semantics verified (not changed)

These were audited against the code and found correct; nothing was loosened.

| Area | Finding |
| --- | --- |
| Zero-call scheduler wake-ups | **PASS.** Every provider call sits inside a bounded loop over `min(budget, run-ceiling, candidates)`; with nothing due both counts are 0. Unit-tested (`providerCallsUsed === 0`). |
| Per-invocation ceiling | **PASS.** `MAX_DISCOVERY_REQUESTS_PER_RUN = 1`, `DEFAULT_MAX_ODDS_REQUESTS_PER_RUN = 1`, and discovery/odds are mutually exclusive per run — a hard ceiling of **1 provider call per wake-up**. |
| Due logic from persisted state | **PASS.** Discovery from `provider_ingestion_runs` (360-minute freshness, 2-day horizon); odds from `provider_odds_requests` plus the `oddsRefreshDue` cadence bands (15/30/120/360 min by time-to-kickoff). Not timers, not in-memory. |
| Ask-time vs observed-time | **PASS.** `provider_odds_requests.last_requested_at` is separate from `odds_observations.provider_observed_at`, and scheduling prefers ask-time — regression-tested ("does not re-buy a price the provider already reported as hours old"). |
| RADAR movement semantics | **PASS.** Movement is grouped by distinct `providerObservedAt` instants; one instant gives `INSUFFICIENT_HISTORY`; ordering is by `providerObservedAt`, never row id; movement and freshness are independent (a stale price may still have moved). Shuffle-invariance tested. |
| Price validity worked example | **PASS.** Model 13.6% gives break-even `7.35294118` and minimum acceptable `7.5`. Policy `price-validity.v1`, `minimumAttractiveExpectedValue = "0.02"`. Exact-decimal throughout. |
| Lineup gate cannot be overridden by EV | **PASS.** `WAIT_FOR_LINEUP` returns before `edgePresent` is read, and promotion is guarded on `gate === "NO_BET"` — proven structurally and by test (edge about 5.9pp, EV about 11%, still `WAIT_FOR_LINEUP`). |
| Odds freshness policy | **PASS.** `odds-freshness-policy-v1`: CURRENT within 45 min, AGING within 180 min, then STALE, plus UNAVAILABLE. Only CURRENT is actionable, and a non-current price is withheld from the forecast cycle entirely rather than downgraded. Thresholds unchanged. |
| LIVE fail-closed | **PASS.** `configuredDataMode()` treats anything but an exact `SYNTHETIC_DEMO` as LIVE; LIVE with no database resolves `UNAVAILABLE`, never `FIXTURE`. No database-failure, preview-flag or platform-variable path back to the fixture. |
| Model maturity | **EXPERIMENTAL**, unchanged. The forecast cycle downgrades every STRONG_EDGE while the artifact is EXPERIMENTAL, and the DTO contract rejects any other value. |
| Greek coverage | **Type-enforced.** `messages.ts` declares `Record<MessageKey, string>` for Greek, so a missing key is a compile error. |

## Not verified in this session

Stated plainly rather than assumed.

| Item | Why |
| --- | --- |
| Cross-user IDOR | Only one authenticated identity exists. A second normal customer account is not available, so this is **NOT TESTED** — not PASS. |
| Production `catalog.competitions.name_key` contents | Needs database access. Every value written in-repo is an internal key, so `competitionLabel` was made safe for both keys and display names. |
| Whether the live Supabase project really has the `*/15` cron installed, at that host | `supabase/operations/provider-ingest-cron.sql` is deliberately not a migration, so the repo cannot prove what is scheduled. Needs `select * from cron.job`. |
| Real provider daily limit | `ASSUMED_DAILY_LIMIT = 100` is a documented assumption; only the provider `/status` endpoint reports the true `limit_day`. |
| Identity-invariant migration applied to production | No production database credential on this machine — see the master release log. |
