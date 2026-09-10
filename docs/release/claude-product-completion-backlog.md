# VELYQ — Product Completion Backlog

Persistent, prioritised backlog for the product-completion mandate. This file
plus `claude-final-master-release.md` and `claude-final-qa-matrix.md` are the
resume point: if a session is interrupted, start here, not from zero.

Status vocabulary: **OPEN**, **IN PROGRESS**, **DONE**, **BLOCKED (owner)**,
**DEFERRED (explicit)**.

### Deployed and verified

`568496c` is live on <https://project-cf8ty.vercel.app> as
`dpl_6jgtVJEcQkvkmZiGZYMGauaNejJe`, verified after deploy against the runbook:
health `LIVE`/`DATABASE`, all ten routes 200 with `/api/v1/today` 401, seven
security headers, Greek on both the prefixed public route and the cookie
locale, `/el/today` 404 as designed, zero synthetic markers on `/today`.

`f2ece99` — result ingestion and settlement, plus catalog-sourced customer
copy — is live as `dpl_AdFxgRiWsFg29UQCnhGHyaKPWU6X`, verified after deploy.
Rollback target `dpl_6jgtVJEcQkvkmZiGZYMGauaNejJe`.

Baseline at the start of this mandate: `043342b`, deployed code `9e28cf9`,
production `dpl_DN5NhB2vPUxs9RA6bZZAJtfDAeTD` on
<https://project-cf8ty.vercel.app>, rollback `dpl_9BdZ2QWLABcSQRfkxxe4yVeWDUvy`.

---

## P0 — release-blocking

| # | Item | Status | Notes |
| --- | --- | --- | --- |
| P0-A | Customer UX redesign (mandate §8-§27) | **IN PROGRESS** | Done: match-card primitives (`TeamCrest`, `CompetitionMark`, `MatchCard`), Today restructure (KPI strip + card grid + Forecasts folded in, page 34% shorter), EDGE segmented by decision state with minimum-valid price and freshness, RADAR evidence depth. Remaining: Match Intelligence flagship (§14), public homepage (§59), Watch panel density, navigation review (§10), History (§26). |
| P0-B | Result ingestion end to end (§28) | **DONE** | `normalizeFootballResult` + `resultRequestDue` + orchestrator RESULT pass + `ingestFootballResults`, batched via `/fixtures?ids=` (20 fixtures per request). Yields to discovery then odds; terminal fixtures never re-asked; 72h give-up window. `operations.provider_result_requests` marker table. 12 orchestrator tests, 15 normalizer tests, 6 real-PostgreSQL integration tests. |
| P0-C | Settlement complete + tested (§29) | **DONE** | Candidate reader recovers the market by joining `decisions` out to the market definition (the table has no market column). Only STRONG_EDGE/EDGE_DISAPPEARED settle; only FINAL settles; UNSETTLED never persisted. Canonical `settlementRuleVersion` rather than the ad-hoc `"1X2.v1"` the tests had used. One transaction per fixture covering result + settlements. Proven against real PostgreSQL, including replay, correction and refused-decision cases. |
| P0-D | Over/Under 2.5 (§18, §30) | **DONE** | Complete end-to-end: writer, provider line parsing, storage, dedup, idempotency, market identity determinism (3 sites fixed), real Dixon-Coles model probability, forecast, decision, settlement -- proven against real PostgreSQL. Customer-facing: `CustomerMatchDto.secondaryMarkets` carries every totals decision; Match Intelligence shows a real "Other markets" card; History's `selectionLabel` gap (OVER/UNDER rendered "—") fixed; Today/EDGE show a compact "Also EDGE" pointer when a secondary market clears the policy while the headline is gated. RADAR intentionally excluded -- it shows the headline market's own price movement, and `CustomerSecondaryMarketDto` has no movement history yet; extending it is a real next increment, not assumed done here. |
| P0-E | Lineup ingestion (§25, §31) | **DONE** | Normalizer, `lineupRequestDue`, orchestrator pass (priority above odds), `provider_lineup_requests` marker, writer with fixture-scoped team attribution. 14 + 14 + 9 unit tests, 7 real-PostgreSQL tests. §26 recomputation-on-lineup is NOT done — see P1-Q. |
| P0-F | Identity invariant migration applied (§40) | BLOCKED (owner) | Review passes; needs a production DB credential. `VELYQ_DATABASE_URL` is a Vercel Secret that Vercel refuses to disclose. |
| P0-G | Exposed Supabase PAT revoked (§41) | BLOCKED (owner) | No Supabase CLI session on this machine. Owner UI action only. |
| P0-H | Authenticated production QA (§5, §77) | BLOCKED (owner) | Needs owner credentials, which must not be requested or handled here. |

## P1 — significant

| # | Item | Status | Notes |
| --- | --- | --- | --- |
| P1-A | Odds writer batching (§20, §32) | **DONE** | Measured: 18 observations fell from 208 round trips / 168 ms to 24 / 25 ms. Cost now bounded by distinct bookmakers and markets, not observations. The measurement is a test (`test-benchmark/`, own database) holding a frozen copy of the old writer, so reintroducing per-observation writes fails there. |
| P1-B | Bookmaker cap raise (§21, §32) | **DONE** | 6 → 16, above the 10-13 the provider returns, so the cap no longer discards anything and a bookmaker appearing or disappearing does not silently change the consensus panel. Costs no extra quota. |
| P1-C | `providerObservedAt` falls back to our fetch time | OPEN | `apisports.ts`: `String(item["update"] ?? ingestedAt)`. An unknown-age price reports CURRENT and actionable. Needs a nullable provider timestamp treated as UNAVAILABLE — schema change. |
| P1-D | Quality policy freshness component is dead | OPEN | `forecast-cycle-adapter.ts` passes `receivedAt: asOf`, so age is always 0, `STALE_DATA` is never emitted and the `WAIT` branch is unreachable. Four of seven weighted components always score full marks. |
| P1-E | Four freshness states collapse to two on the DTO | OPEN | `"FRESH" \| "STALE"`; an AGING price (46-180 min) shows as "Out of date", indistinguishable from 27 hours old. |
| P1-F | Daily quota simulation (§35) | OPEN | Deterministic quiet/normal/heavy/worst-case projections as tests. |
| P1-G | Scheduler observability in admin (§36) | **PARTIAL** | `getQuotaSnapshot()` reads the existing `provider_quota_state` table (no migration, no new instrumentation) and the intelligence dashboard now shows a "Provider quota" panel: policy state, remaining/daily limit, per-purpose call counts (discovery/odds/lineup/result), last provider call time, per provider/day. **Remaining:** no explicit "zero-call wake-ups" counter or "next work due" projection -- those aren't persisted anywhere today and would need new instrumentation in the orchestrator itself, a larger change than reusing an existing table. |
| P1-H | Provider ingestion funnel in admin (§37) | PARTIAL | A funnel diagnostic exists; verify it answers "why is Today empty?" without SQL. |
| P1-I | Model audit: Brier, log loss, calibration bins, baseline (§45) | **PARTIAL** | Admin's model health previously hand-rolled Brier/log-loss inline; replaced with the shared, tested `brierScore`/`logLoss`/`reliabilityBins`/`expectedCalibrationError`/`empiricalFrequencies` (`packages/research/src/metrics.ts`), which existed fully tested but had zero callers anywhere (same unwired pattern as `marketConsensus`/`trackRecord`). Admin's Model health panel now shows calibration bins and the empirical-frequency baseline, neither of which existed before. **Scoped as binary** (did the decision's own selected outcome happen or not), not a true three-way 1X2 calibration -- the forecasts table stores one probability per acted-on outcome, not the full HOME/DRAW/AWAY vector per market instance, so a genuine multi-class calibration needs a new join across sibling forecasts, not yet built. No commercial validation claim is made anywhere. |
| P1-J | Future-data-leakage adversarial tests (§46) | **PARTIAL** | Audited odds cutoff (`getFreshestOdds`/`getAllValidObservations` both filter `providerObservedAt <= asOf` -- already correct), lineup cutoff (**real bug found and fixed**: `computeLineupState` had no upper bound; `getLineupState` now takes `asOf`, adapter filters `receivedAt <= asOf`), and result/settlement self-reference (none exists anywhere in the forecast/decision path -- confirmed clean). A unit-level regression test proves `asOf` reaches `getLineupState`; a real-PostgreSQL adversarial test (seed a lineup observation timestamped after `asOf`, assert it's never read) is not yet added -- left for the integration suite. Walk-forward training discipline (`packages/research/src/walk-forward.ts`) already enforces an expanding window with an untouched holdout; a walk-forward-specific adversarial leakage test (a future-dated match's result cannot influence an earlier window's fitted ratings) also remains open. Closing-price use in backtests not yet separately audited. |
| P1-K | Two-user IDOR proof (§52, §66) | **PARTIAL** | Audited: nothing user-specific is addressable by id anywhere — subscription reads are all scoped to the verified token's user with no id parameter on the path, and `eventId` resolves shared match data. A live two-identity test still does not exist. |
| P1-L | Pagination on growing surfaces (§44) | **PARTIAL** | History: `DatabaseHistoryQueryAdapter.listDecisions` now takes a keyset cursor `{createdAt, id}` (not OFFSET -- stable under new decisions landing mid-browse); `/api/v1/history` returns `{hasMore, nextCursor}`; Results has a "Load older decisions" control. Admin `provider-runs`/`audit` were already cursor-paginated (`{limit, cursor} -> {items, nextCursor}`, confirmed by research, untouched here). Admin `predictions` is single-ID lookup, not a list -- not applicable. **Remaining:** odds history and evidence timeline (the latter still doesn't exist as a feature at all -- see the Evidence Timeline backlog item). No new DB index added for the History keyset scan (`(status, created_at desc, id desc)` would help at scale) -- needs a migration against the production database credential P0-F is blocked on; current volume doesn't yet make the scan a real cost. |
| P1-M | Accessibility audit (§55) | **DONE (audit)** | Checked semantic structure (heading hierarchy via `EmptyState`'s `as` prop and `CardHead`'s `level` prop, both used correctly everywhere), interactive elements (zero `<div>`/`<span onClick>` pseudo-buttons anywhere -- every click handler is a real `<button>`), color-only signal (`Badge` always renders visible text, never color/dot alone), images (no bare `<img>` anywhere in the app), forms (sign-in/sign-up/forgot/reset-password all use real `<label htmlFor>`, not placeholder-only), and `<html lang>` (set dynamically per locale in `layout.tsx`). App was already in strong shape. Two real gaps found and fixed: Results' new "Load older decisions" list had no `aria-live` region (a screen-reader user got no feedback that anything loaded); `Badge`'s decorative dot span had no `aria-hidden`. No automated axe/pa11y CI check exists yet -- recommended as a future follow-up, not done here. |
| P1-N | Post-match autopsy (§27) | **DONE** | `listDecisionsForEvent` reuses `listDecisions`'s exact join chain (decision -> forecast -> market/outcome definitions -> event/competition -> settlement -> result), scoped by event id instead of STRONG_EDGE status -- no new join. Match Intelligence shows a "Post-match autopsy" card once a fixture has settled: final score, price at decision vs. closing price, CLV, and each decision's own stored why-not reason codes. Null (no card, not an error) for any fixture that hasn't settled. Nothing generated -- every field is a value already computed and persisted; no narrative commentary was added, consistent with the product's no-fabrication principle. |
| P1-O | Opportunity lifecycle (§86) | OPEN | DISCOVERED -> WATCH -> PRICE_VALID -> EDGE -> WAIT_FOR_LINEUP -> EDGE_DISAPPEARED -> CLOSED -> SETTLED with timestamps. |
| P1-P | "Why nothing today?" aggregate explanation (§87) | **DONE** | `CustomerTodayDto.summary` (`CustomerTodayAggregateDto`: totalFixtures, counts by recommendation, lineupGated) computed once in `mapToday` from the same unsliced fixture list Today already maps -- no second query, and independent of the internal funnel-diagnostic route (still ops-only, untouched). Today's empty state cites real counts instead of a stock sentence. `summariseTodayAggregate` lives in its own zero-dependency module so the demo/fixture builder needn't pull in the database adapter. |

### Added by this mandate

| # | Item | Status | Notes |
| --- | --- | --- | --- |
| P1-Q | Recompute on lineup arrival (§26) | **DONE** | `ingestFootballLineups` reports which event ids received a genuinely new observation (not a duplicate/skip); `runProviderIngestion` surfaces the list; the admin `provider-ingest` route calls `runForecastCycle` for exactly those events in the same request via a new optional `eventIds` filter on `loadEligibleFixtures` (daily cron path unchanged, remains the fallback if the recompute itself errors). `CHANGED` lineup-status detection investigated and NOT implemented -- `lineup_observations_status_check` only allows EXPECTED/OFFICIAL/UNAVAILABLE at the database level; widening it needs the same production migration credential P0-F is blocked on. What Changed and Evidence Timeline remain unimplemented concepts (no type, route, or UI exists for either) — this item only closes the recompute gap, not those surfaces. |
| P1-R | Market identity determinism (§19) | **DONE** | `forecast-cycle-adapter` resolved an event market by `where(eventId).limit(1)`; the customer match query ordered markets by a random uuid; `selectOutcome` fell back to "any outcome with evidence". All three were correct only while one market existed. |
| P1-S | Provider registry and data rights (§49, §6, §11) | **DONE (research)** | `docs/architecture/live-data-sources.md`. Two of the most useful free sources have terms that do not address commercial use; recorded as UNCLEAR rather than assumed. One paid recommendation stated with exact cost, not purchased. |
| P1-T | Authorization and caching audit (§51) | **DONE** | Admin pages authorized with the weaker `hasPermission` while the APIs for the same data used `hasAdminPermission`. Five private routes were cacheable by a shared cache — one a cross-customer billing leak, four a paywall bypass. Guard test added. |
| P1-X | "Show the best price" | **DONE** | `currentOdds` was already the best price across every bookmaker at the latest instant (`bestAt()` in `odds-movement.ts`) — the gap was that no surface said so. Rather than build a new UI on the disconnected `packages/market-semantics` de-vig consensus math (confirmed unused anywhere outside its own tests), `summariseOddsMovement` now returns a distinct-bookmaker `bookmakerCount`, threaded onto `CustomerMatchDto.bookmakerCount?` and shown as "Best of N books" on Match Intelligence. Wiring `marketConsensus()`/de-vig into a customer surface remains open as its own, larger increment (Market Consensus, below) if the product wants implied-probability spread shown, not just a price count. |
| P1-U | Multi-provider quota orchestration (§48) | OPEN | One quota state exists, keyed by provider. A second provider needs its own budget state and a capability-priority policy; counters must never be mixed. |
| P2-O | Final adversarial security review | **DONE (clean)** | Targeted pass (not a generic checklist), independently cross-checked by a second review reaching the same conclusions: every `/api/v1/*` route calls `requireCustomerSession` with a real entitlement before touching data; `today/route.ts` truncates server-side, not just client-side (closing a cache-based paywall bypass); admin's new `getQuotaSnapshot()` is reachable only through `getAdminContext("admin.access")`, no standalone unauthenticated route; all raw `sql\`...\`` in `database-admin.ts` is fully static, zero interpolation; no hardcoded secrets; the new history cursor (`history-cursor.ts`) fails closed to "first page" on any malformed input, no injection surface; no CORS/OPTIONS handlers exist anywhere (no cross-origin state-changing exposure -- everything reviewed is read-only). One real gap found and fixed: `listDecisionsForEvent` (added this session for Post-Match Autopsy) had no `events.synthetic` corpus filter, unlike every other customer read path -- not currently exploitable (its only caller runs after an equivalent check already ran) but a latent trap for a future caller; fixed by requiring a `synthetic: boolean` parameter. |
| P2-N | Market Consensus / Market Map / Risk Flags | **DONE (code), NOT YET DEPLOYED** | `buildMarketSnapshot` (packages/market-semantics) turns raw per-bookmaker odds into one coherent snapshot -- grouped by the provider's own exact observation instant (API-Sports reports one `update` timestamp per whole odds document, so exact-instant grouping recovers genuine simultaneity), and only lets a bookmaker whose book is complete across every required outcome enter the de-vig consensus; a partial book still contributes to best/median price but never joins consensus with a borrowed price from an earlier instant. Wired into `mapMatch` for the FT 1X2 headline market via `buildCustomerMarketConsensus`; `CustomerMatchDto.marketConsensus?`/`riskFlags?` added. Match Intelligence shows a "Market Map" card and a "Risk flags" badge row; EDGE and RADAR rows also show risk flags (same computed field, second render site). Risk flags derived from real evidence: STALE_MARKET/AGING_MARKET (freshness), LOW_MARKET_COVERAGE/MARKET_CONSENSUS_UNAVAILABLE/HIGH_BOOKMAKER_DISPERSION/OUTLIER_PRICE (the new consensus and its outlier candidates), WAITING_FOR_LINEUP, MODEL_EXPERIMENTAL, IDENTITY_UNCERTAIN, INSUFFICIENT_HISTORY -- all ten flags now derived. Code `aaf8a80`..`4eedbb9`, committed and pushed. **Not yet on production** -- Vercel's free-plan daily deployment cap (100/day) was hit immediately after the first commit built successfully; blocked on the ~24h reset, not on anything technical; every subsequent commit in this item is queued behind it too. **Remaining:** secondary markets (O/U 2.5) don't show their own Market Map yet, only the FT 1X2 headline; admin has no market-consensus/risk-flag observability yet (would need its own DB-level snapshot query -- `apps/admin` reads via raw SQL, not the customer `CustomerRawMatch` pipeline this feature is built on). |
| P1-Z | CLV (closing-line value) aggregate | **DONE** | CLV was already computed correctly (`closingLineValue()` in packages/analytics, decimal-odds ratio, tested) and already persisted per decision (`marketSettlements.clv`), and History already showed a per-row value and a "N/M positive CLV" ratio -- but nothing showed the AVERAGE magnitude, so winning big and losing small read identically to the reverse under the ratio alone. `trackRecord()` already computed the ratio but had no caller anywhere in the codebase (same unwired-but-tested pattern as `marketConsensus()`); added `averageClv` to its return and wired it into Results as a fifth stat. Not surfaced in admin -- customer History remains the only place CLV is visible, which is where it belongs. |
| P1-Y | Timezone / DST audit | **DONE (audit, no bug found)** | Checked `utcDayWindow` (pure UTC `setUTCHours`/`setUTCDate` arithmetic, no local-time or fixed-offset assumption), kickoff-time display (`formatTime`/`formatLongDate` pin `timeZone: "UTC"` explicitly -- a deliberate product choice, not a DST bug), forecast-cycle's window default (anchors to `utcDayWindow`), grep for local-time methods (`.getHours()`/`.getDate()`/etc -- none found in application code), and provider ingestion (API-Sports payloads always carry an explicit UTC offset/`Z`, confirmed by its own test fixtures -- no DST-ambiguous local-time parsing). No bug found. Locked in with a regression test asserting `utcDayWindow` produces an ordinary 24h window on both 2026 EU DST transition dates (2026-03-29 spring-forward, 2026-10-25 fall-back). |
| P1-V | Source conflict policy (§9) | OPEN | Nothing to disagree with while there is one source. Two sources disagreeing on kickoff, identity, lineup or result must resolve deterministically and fail closed for decision-critical ambiguity. |

## P2 — hardening and polish

| # | Item | Status | Notes |
| --- | --- | --- | --- |
| P2-A | Hardcoded `locale === "el"` copy blocks | **DONE** | All four moved into `messages.ts`, so a missing Greek string is now a typecheck failure. `intlLocale()` replaces the second inline conditional. A guard test walks `apps/web/app` and fails on any `locale === "el"` in executable code. |
| P2-B | `footerCreatedBy` untranslated in Greek | **DONE** | Translated. The test asserting it stay English called it a proper noun; the proper noun is "Joker2face", which the view renders separately. |
| P2-C | Landing-page demo needs an explicit EXAMPLE label (§59) | OPEN | Real product vocabulary on a fictional fixture with no visible marker beyond a competition named "Premier Synthetic League". |
| P2-D | `proxy.ts` still reads the retired `VELYQ_SYNTHETIC_PREVIEW` | OPEN | Only to choose a sign-in origin when `VELYQ_APPLICATION_ORIGIN` is unset; production sets it. Tidiness. |
| P2-E | Odds-history API returns an ungrouped cross-section | OPEN | `observations` is the flat per-bookmaker row set, and returns `[]` in live mode. No consumer today; a latent trap. |
| P2-F | Contract lacks the movement invariant | **DONE** | Added with the `observationTimes` field earlier in this mandate. |
| P2-G | Two unreconciled EV thresholds | OPEN | `decision-policy.v1` requires edge >= 0.03 AND EV >= 0; `price-validity.v1` requires EV >= 0.02 and ignores edge. Nothing states the relationship. |
| P2-H | Decision engine computes in float, `calculateValue` in exact decimal | OPEN | Two implementations of one formula; the float versions are what get persisted. |
| P2-I | Freshness policy version never reaches the DTO or trace | OPEN | A past verdict cannot be re-read against its policy. |
| P2-J | Light mode (§52) | DEFERRED (explicit) | Dark is primary. Deferred unless it can be done without delaying P0/P1. |
| P2-K | Customer search (§48) / filters (§49) | OPEN | Only if genuinely functional. No decorative controls. |
| P2-L | Watch-event domain foundation (§50) | OPEN | Domain events only; no external notification provider. |
| P2-M | `--archive=tgz` and CLI-upload deployment unreliability | DONE (documented) | Recorded in the release log with the working `redeploy --target production` route. |

## Explicitly deferred by the mandate

| Item | Reason |
| --- | --- |
| Stripe / billing | §62. Do not implement. Preserve future gating architecture. |
| AI / Ask VELYQ | §63. AI OFF, no OpenAI token, zero calls. Deterministic engine authoritative. |
| Cloudflare canonical `velyq-poc` changes | §72. Do not alter without a documented reason. |
| `main`, `integration/phase-1`, PR #3 | §93. Do not modify. Do not delete branches. |

## Environment notes

- Heavy build worktree moved OUT of OneDrive to `C:\Users\thodo\velyq-release`
  (§81). The OneDrive worktree `.worktrees/final-release-home` is left in place,
  detached, and is not destroyed. Git objects still live in the OneDrive main
  repository, but `.next`, `dist`, Playwright and Turbo churn no longer sync.
- pnpm is installed to `C:\Users\thodo\.npm-global` because corepack's global
  shim needs administrator rights here. Every command needs that directory on
  `PATH`.
- Vercel CLI is authenticated as `joker2faces`. Database integration uses
  PostgreSQL 17 inside WSL `Ubuntu-24.04` on port 55432.
- `pnpm test:e2e:admin` provisions its own seeded database; the customer e2e
  project deliberately needs none.
- Deployment: CLI uploads currently stall at `UNKNOWN`. Use
  `vercel redeploy <git-sourced-deployment> --target production`, which
  rebuilds with the PRODUCTION environment. Never promote a preview.
