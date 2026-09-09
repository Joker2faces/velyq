# Live data pipeline: why Today was empty, and what has to exist for it not to be

Measured against the production database on 2026-09-09 through
`/api/internal/funnel-diagnostic` on an isolated release candidate. Every
number below is a real production count, not an estimate.

## What is actually in production

| Stage                              | Count | Reading                                        |
| ---------------------------------- | ----: | ---------------------------------------------- |
| `catalog.events` (all time)        |   456 | real fixtures did flow at some point           |
| ... of which synthetic             |     2 | two synthetic rows share the live catalog      |
| `catalog.event_identities`         |   439 | provider provenance exists for almost all      |
| `catalog.competition_identities`   |    23 | all 23 `CONFIRMED`                             |
| `market.odds_observations`         |  1156 | real prices were ingested                      |
| `operations.provider_sync_runs`    |    12 | ingestion has run — twelve times, by hand      |
| `intelligence.predictions`         |     1 | the forecast cycle has essentially never run   |
| `intelligence.decisions`           |     0 | no decision has ever been persisted            |
| `intelligence.market_settlements`  |     0 | nothing has ever settled                      |
| **Fixtures in today's UTC day**    | **0** | **the customer-visible cause**                 |
| Fixtures in the next 48h           |     0 | not a "today only" artefact                    |

Timestamps that identify the fault:

- earliest event `2026-09-03 18:00Z`, **latest event `2026-09-08 23:30Z`**
- last provider sync run `2026-09-08 04:51Z`
- latest odds observation `2026-09-08 04:27Z`
- last prediction run `2026-09-03 10:00Z`

The newest fixture in the catalog kicked off **yesterday**. The catalog simply
stops on 2026-09-08, roughly 27 hours after the last hand-run ingestion.

## Why Today is empty

`DatabaseCustomerQueryAdapter.getToday` selects events whose `starts_at` falls
in the current UTC calendar day and applies no other filter; the mapper
(`customerDatabaseMapper.mapToday`) is pass-through. So Today is empty for
exactly one reason: **there are no fixtures for today.** It is not a window
bug, not a filter bug, not a mapping failure, and not a quality rejection —
those stages are all downstream of a stage that is already zero, and the
mapping stage is demonstrably healthy (23/23 competition identities
`CONFIRMED`, 439/456 events carrying provider identity).

The cause of *that* is structural, and it is the finding that matters:

**Nothing in the deployed system ever ingests a fixture.**

- The real API-Sports client (`createApiSportsClient`) and its normalizers
  (`normalizeFootballFixture`, `normalizeOdds`) exist and are tested, and have
  **zero non-test callers** anywhere in the repository.
- The real persistence writers (`ingestFootballFixture`, `ingestFootballOdds`,
  `ensureFootballReferenceData`) exist and are integration-tested against
  Postgres, and likewise have **zero non-test callers**.
- The only ingestion entrypoint that exists, `workers/ingestion`'s `replay`
  CLI, reads `SyntheticReplaySource` at a hardcoded clock default of
  `2026-09-03T11:00:00Z`. It is a replay harness, not a provider ingest.
- `workers/ingestion` and `workers/prediction` have no `wrangler` config, so
  neither is deployed anywhere.

The client is built, the writers are built, and no wire connects them.

## Why automation did not save it

The entire repository contains exactly one schedule: `apps/web/vercel.json`,
one cron entry, `0 4 * * *`. It invokes `/api/internal/forecast-cycle`, and
that route reads fixtures **already in the database**
(`loadEligibleFixtures` selects from `catalog.events`) — it cannot discover a
fixture. There is no schedule for fixture discovery, odds refresh, lineup
polling, or settlement, and the Cloudflare configuration carries no
`triggers`/`crons` block at all.

A second, independent defect sits next to it: `prediction_runs` = 1 and
`decisions` = 0, with the last run on 2026-09-03, even though fixtures existed
from 09-03 to 09-08. The daily Vercel cron is therefore either not firing or
failing before it persists anything. That needs its own investigation; it is
not the cause of the empty Today, but it means the one piece of automation
that does exist is also not working.

## Window misalignment (separate, real)

The forecast cycle's default window is `[now, now + 24h)`
(`validateForecastCycleRequest`). Fired by cron at 04:00 UTC, it covers
04:00 today through 04:00 tomorrow, and therefore **never covers 00:00–04:00
of the current day** — the window the customer's Today surface does cover.
Fixtures kicking off in those four hours can never receive a forecast.

## No odds staleness policy exists

`DatabaseFreshestOddsReader` accepts any observation with
`provider_observed_at <= asOf`, however old — the only "validity" rule is that
a price is not from the future. There is no age bound anywhere in the
pipeline, so a three-day-old price is treated as current market evidence. With
the latest observation now ~27 hours old, every price in the database would
qualify. The funnel diagnostic therefore applies its own 180-minute reporting
boundary purely so "priced with yesterday's market" is visible; that is a
reporting device, not an enforced policy, and a real policy still has to be
chosen and applied at the decision layer.

## What the scheduler can actually be

Researched against current published limits rather than assumed.

**Cloudflare Workers, Free plan** — cannot host this work:

- Cron Trigger CPU limit: **10 ms**. An ingestion cycle needs seconds.
- Subrequests: **50 per invocation**. A day of fixtures plus odds for the
  eligible subset exceeds this on its own.
- Cron Triggers per account: 5.

**Cloudflare Workers, Paid plan** — sufficient:

- Cron CPU: **30 s** for intervals under an hour, 15 min at or above an hour.
- Subrequests: **10,000 per invocation**.

**Vercel Hobby** — insufficient for the odds cadence: daily granularity only,
which is why the single existing cron is `0 4 * * *`.

The cadence the product actually needs:

| Job                | Natural cadence                             |
| ------------------ | ------------------------------------------- |
| Fixture discovery  | 2–4× daily                                  |
| Odds refresh       | every 15–30 min for fixtures near kickoff   |
| Lineup polling     | hourly inside the lineup window only        |
| Prediction cycle   | after each odds refresh                     |
| Result settlement  | hourly after kickoffs conclude              |

Neither free tier can meet the odds cadence, so this is a genuine
paid-plan decision for the owner. Until that decision, the free path that does
work is a scheduled GitHub Actions workflow running the ingestion entrypoint
as an ordinary Node process against Supabase: 5-minute cron granularity, no
CPU ceiling, and the provider key and database URL held as Actions secrets.
Private-repository Actions minutes are metered (2,000/month on the free
tier), so a ~1-minute job every 30 minutes is roughly 1,440 minutes/month —
feasible, but close enough to the ceiling to be worth watching.

The recommended end state remains Cloudflare Cron Triggers on the paid plan,
matching the deployed customer runtime, with the external scheduler as the
interim trigger only.

## Integrating the ingestion: port the policy, reimplement the persistence

`origin/codex/intelligence-completion-v2` carries a real ingestion
orchestrator (`tooling/scripts/apisports-ingest.ts`, 565 lines) plus
`provider-ingest` routes, `apisports-lineups.ts` and `lineup-schedule.ts`.
None of it is on this branch, though this branch's
`apps/web/app/forecast-cycle/auth.ts` already documents
`VELYQ_INGEST_SECRET`, and the canonical Vercel project already holds both
`VELYQ_INGEST_SECRET` and `APISPORTS_KEY` — the auth and the credentials were
provisioned for a route that was never merged here.

It must not be merged as-is. Its quota discipline is genuinely good and should
be **ported**:

- a reserve fraction of the provider's reported remaining quota,
- `CONSERVE` / `CRITICAL` / `EXHAUSTED` states that stop odds collection,
- a hard `maxOddsRequests` cap that holds even when the provider reports no
  remaining count at all,
- `prioritizeEventsForOddsCollection`, which deprioritises rather than
  excludes unmapped competitions, and never lets fixture discovery be bounded
  by quota because the catalog must stay complete.

Its persistence must be **reimplemented**, not ported. The orchestrator writes
through hand-built raw SQL strings, which bypasses
`ingestFootballFixture`/`ingestFootballOdds` — and with them
`resolveCompetitionIdentity` (provider-ID-keyed, the fix for Brazilian Série A
resolving to Italy's) and the verified team-alias resolver. Porting it
verbatim would reintroduce name-derived competition mapping and
alias-blind team resolution: a regression of two settled P0 defects, in
exchange for code that cannot be validated end to end without the provider
key anyway.

The remaining blocker is that key. `APISPORTS_KEY` exists on the canonical
Vercel project as a Secret-type variable, which Vercel will not reveal
(`vercel env pull` returns `[SENSITIVE]`), and it is not present on either
Cloudflare Worker — both have no secrets at all. A live ingest cannot be run
until the owner supplies it to whichever runtime is chosen. Current provider
quota is likewise unknown for the same reason: it is reported only in
response headers, and no stored quota state exists to read instead.
