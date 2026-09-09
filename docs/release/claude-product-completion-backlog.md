# VELYQ — Product Completion Backlog

Persistent, prioritised backlog for the product-completion mandate. This file
plus `claude-final-master-release.md` and `claude-final-qa-matrix.md` are the
resume point: if a session is interrupted, start here, not from zero.

Status vocabulary: **OPEN**, **IN PROGRESS**, **DONE**, **BLOCKED (owner)**,
**DEFERRED (explicit)**.

Baseline at the start of this mandate: `043342b`, deployed code `9e28cf9`,
production `dpl_DN5NhB2vPUxs9RA6bZZAJtfDAeTD` on
<https://project-cf8ty.vercel.app>, rollback `dpl_9BdZ2QWLABcSQRfkxxe4yVeWDUvy`.

---

## P0 — release-blocking

| # | Item | Status | Notes |
| --- | --- | --- | --- |
| P0-A | Customer UX redesign (mandate §8-§27) | OPEN | Previously authorised and not implemented. Now required. Largest single item. |
| P0-B | Result ingestion end to end (§28) | OPEN | `RESULT: 10` daily budget allocated; no fetch port, no due predicate, no call site. |
| P0-C | Settlement complete + tested (§29) | OPEN | Engine exists (`result-settlement.ts`); depends on P0-B for live results. |
| P0-D | Over/Under 2.5 end to end (§30) | OPEN | Writer hardcodes one market and `lineValue: null`. Every other layer supports totals. |
| P0-E | Lineup ingestion operational (§31) | OPEN | `LINEUP: 15` budget allocated; no port/predicate/call site. `WAIT_FOR_LINEUP` cannot clear from live data. |
| P0-F | Identity invariant migration applied (§40) | BLOCKED (owner) | Review passes; needs a production DB credential. `VELYQ_DATABASE_URL` is a Vercel Secret that Vercel refuses to disclose. |
| P0-G | Exposed Supabase PAT revoked (§41) | BLOCKED (owner) | No Supabase CLI session on this machine. Owner UI action only. |
| P0-H | Authenticated production QA (§5, §77) | BLOCKED (owner) | Needs owner credentials, which must not be requested or handled here. |

## P1 — significant

| # | Item | Status | Notes |
| --- | --- | --- | --- |
| P1-A | Odds writer batching (§32) | OPEN | ~7-10 DB round trips per observation, each its own transaction, ~12s per fixture. Gates raising the bookmaker cap above 6. |
| P1-B | Bookmaker cap raise after batching proves safe (§32) | OPEN | Depends on P1-A. Provider already returns 10-13 bookmakers. |
| P1-C | `providerObservedAt` falls back to our fetch time | OPEN | `apisports.ts`: `String(item["update"] ?? ingestedAt)`. An unknown-age price reports CURRENT and actionable. Needs a nullable provider timestamp treated as UNAVAILABLE — schema change. |
| P1-D | Quality policy freshness component is dead | OPEN | `forecast-cycle-adapter.ts` passes `receivedAt: asOf`, so age is always 0, `STALE_DATA` is never emitted and the `WAIT` branch is unreachable. Four of seven weighted components always score full marks. |
| P1-E | Four freshness states collapse to two on the DTO | OPEN | `"FRESH" \| "STALE"`; an AGING price (46-180 min) shows as "Out of date", indistinguishable from 27 hours old. |
| P1-F | Daily quota simulation (§35) | OPEN | Deterministic quiet/normal/heavy/worst-case projections as tests. |
| P1-G | Scheduler observability in admin (§36) | OPEN | Last wake-up, last provider call, calls today, remaining quota, zero-call wake-ups, next work due. |
| P1-H | Provider ingestion funnel in admin (§37) | PARTIAL | A funnel diagnostic exists; verify it answers "why is Today empty?" without SQL. |
| P1-I | Model audit: Brier, log loss, calibration bins, baseline (§45) | OPEN | Infrastructure only. No commercial validation claim. |
| P1-J | Future-data-leakage adversarial tests (§46) | OPEN | Feature/odds/lineup/result cutoffs; closing-price use in backtests. |
| P1-K | Two-user IDOR proof (§66) | OPEN | Needs isolated DB-backed test identities in the integration environment. |
| P1-L | Pagination on growing surfaces (§44) | OPEN | History, odds history, evidence timeline, admin runs/events/predictions. Expose coverage semantics honestly. |
| P1-M | Accessibility audit (§55) | OPEN | Beyond the focused checks already in the customer journey. |
| P1-N | Post-match autopsy (§27) | OPEN | Depends on P0-B/P0-C. |
| P1-O | Opportunity lifecycle (§86) | OPEN | DISCOVERED -> WATCH -> PRICE_VALID -> EDGE -> WAIT_FOR_LINEUP -> EDGE_DISAPPEARED -> CLOSED -> SETTLED with timestamps. |
| P1-P | "Why nothing today?" aggregate explanation (§87) | PARTIAL | A funnel diagnostic exists; needs the customer-facing aggregate with real counts. |

## P2 — hardening and polish

| # | Item | Status | Notes |
| --- | --- | --- | --- |
| P2-A | Hardcoded `locale === "el"` copy blocks | OPEN | `today-view.tsx` (11-key object), `results-view.tsx` (12-key object + 2 inline label fns), `customer-shell.tsx` (a nav item), `matches/[id]/page.tsx` (paywall copy). These bypass the `Record<MessageKey, string>` exhaustiveness check that guarantees Greek coverage. |
| P2-B | `footerCreatedBy` untranslated in Greek | OPEN | `messages.ts`. |
| P2-C | Landing-page demo needs an explicit EXAMPLE label (§59) | OPEN | Real product vocabulary on a fictional fixture with no visible marker beyond a competition named "Premier Synthetic League". |
| P2-D | `proxy.ts` still reads the retired `VELYQ_SYNTHETIC_PREVIEW` | OPEN | Only to choose a sign-in origin when `VELYQ_APPLICATION_ORIGIN` is unset; production sets it. Tidiness. |
| P2-E | Odds-history API returns an ungrouped cross-section | OPEN | `observations` is the flat per-bookmaker row set, and returns `[]` in live mode. No consumer today; a latent trap. |
| P2-F | Contract lacks the movement invariant | OPEN | `INSUFFICIENT_HISTORY` with a non-null `movementPercent` would validate. |
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
