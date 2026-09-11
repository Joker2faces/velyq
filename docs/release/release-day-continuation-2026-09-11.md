# VELYQ release-day continuation — 2026-09-11

This is the authoritative release-candidate record for the release-day continuation on
`codex/velyq-final-product-v1`. It supplements the historical
[master release log](./claude-final-master-release.md) and
[production runbook](./claude-production-runbook.md). The Cloudflare POC
manifest and readiness record describe a different branch and deployment.

## Current state

| Item | State |
| --- | --- |
| Starting SHA | `11731e3d17a327730420e19b7111bec2678ca36b` |
| Final corrected source candidate | `1109307`; reviewed snapshot reconciliation is `d2674a4fa6e9b72d7a2980d58d08a2d3fed5d430`; deployed documentation-inclusive source is `10cf0ed8db980d17a4e3eeffee2f6ccc4b76906d` |
| Authoritative branch before deployment | Local and `origin/codex/velyq-final-product-v1` were clean and identical at `10cf0ed8db980d17a4e3eeffee2f6ccc4b76906d` |
| Final integrated local release gate | **PASS** at corrected source `1109307`; final independent re-review approved with 0 Critical / 0 Important / 0 Minor findings |
| Production database migration | Not performed |
| Customer continuation deployment | **READY**: `dpl_DYHpgooSqLcjfqeh2SDozGC1g6M4`, built from `10cf0ed8db980d17a4e3eeffee2f6ccc4b76906d` |
| Customer production alias | `https://project-cf8ty.vercel.app` resolves to `dpl_DYHpgooSqLcjfqeh2SDozGC1g6M4` |
| Admin continuation deployment | Final source preview `dpl_CHfBtDepT53bLiahgkyq6YoyX6iE` is READY but remains Preview-only behind deployment protection; it was intentionally not promoted before the production migration |

The customer application is live on the continuation source. The Admin/provider
writer remains on the safe side of the migration boundary: preview built, not
promoted. Applying the production migration and promoting/verifying Admin are
owner-only release steps.

## Exact continuation commits

| Task | Commits |
| --- | --- |
| Coherent multi-class calibration | `b4246af405e9df25d75521b6ebdb99828fddc047`, `de27ac6f75c025d6ec6952489dd3ef5834dc577a` |
| Terminal voids and regulation scores | `b5b8b917c6f3e4f5a2dfeda206fc67298b831c17` |
| Correction-safe History and Autopsy | `71ed19403121b2474eb3ecaeb4225a9351329989`, `06a7234239bdf836c11243703ea766146db7a778` |
| Odds receipt cutoff and exact closing median | `74356944387c1891e618cd938f9ef39ed1bc478b` |
| True opening odds | `2142536c054288fe956649c1aadfa0c9c904914e`, `8f38956c1db971b2261e80d3cd1d3344fe42487a` |
| Honest result acquisition/settlement time and terminal calibration authority | `0dc965f3556782bd1e6dc2f353df7db6a7854eef`, `e8e4c000bae9d9ef939ca1e61c2b9c9febde0c8c`, `1109307` |
| Live provider ingestion in Admin | `09870d99fd6d57e92aaf912a3b2ed4372e179834`, `6493a59a3a3a8bcd3766aae32e0e3a7da97eb08e`, `dc16c3ef17b75bf9d115f39736f508cd3b6211d1`, `0bebe8c` |
| Batched customer reads | `b050f492290d1f12ebfe52fa59faf59ace3f15e3`, `0913598eff3ff4e39e4a26ed5befb419e774e563` |
| Greek History and compact header | `3ee69545b416a4c3314b997dfe3b0a2f80fdb68b`, `680a12d36e630a60698c542f8ce95311bb782320` |
| Quality at decision in Autopsy | `a4082097d25b5412f0e62766801efe703dc517e3` |
| Reviewed snapshot reconciliation | `d2674a4fa6e9b72d7a2980d58d08a2d3fed5d430` |

## Verified behavior

- Calibration consumes one complete, pre-kickoff HOME/DRAW/AWAY vector from
  one completed prediction run and one authoritative corrected FINAL result.
- API-Sports AET/PEN uses the explicit regulation score. CANCELLED and
  ABANDONED decisions settle VOID; nonterminal results remain unsettled and
  replays remain idempotent.
- History and Post-Match Autopsy collapse append-only result/settlement
  corrections before pagination, use deterministic authority, traverse
  same-millisecond rows exactly once, and keep LIVE and SYNTHETIC_DEMO corpora
  separate.
- Decision-time price and quality readers require both provider observation
  and receipt by the cutoff. Closing-price ordering and median arithmetic are
  exact-decimal.
- Match and odds-history reads retain all bookmakers at the true opening
  instant plus the newest 500 rows, with stable chronological de-duplication.
- Result receipt, normalization, and settlement availability are no longer
  backdated to kickoff. Unknown provider result-observation time remains null;
  later replays do not rewrite original evidence.
- Admin reads live scheduler health from `provider_ingestion_runs`, keeps
  `provider_sync_runs` explicitly labelled as replay provenance, distinguishes
  idle/blocked/error states, uses stable keyset pagination, and returns
  `private, no-store` responses.
- Greek History renders typed translated labels and metadata. The compact
  authenticated header remains visible at 360/390/430 px without overflow.
- Post-Match Autopsy joins the exact persisted
  decision-to-forecast-to-prediction-to-assessment chain and shows recorded
  quality/policy evidence only; missing evidence stays explicitly absent.

## Integrated release verification

The final Task 6 local gate passed from the clean, documentation-inclusive
candidate tree:

- `pnpm verify`: formatting and zero-warning lint passed; typecheck 18/18;
  unit tests 136 files / 1,244 tests; build 18/18, including optimized
  production web and Admin bundles.
- Fresh PostgreSQL 17 migration/seed: 14 files / 88 tests passed.
- Representative database upgrade: passed with data preserved.
- Production-faithful reconciliation: passed on the recorded legacy schema,
  including historical source/result preservation and the complete DB suite.
- Worker readiness: passed.
- Customer Playwright: 15/15 on each of three consecutive runs, including the
  full desktop/mobile screenshot sweep, EN/EL History, and Autopsy quality.
- Admin Playwright: 5/5 on each of two initial independently provisioned,
  migrated, and seeded PostgreSQL runs, then 5/5 again after the final Admin
  failure-classification correction.
- The two intentional History baselines were regenerated only after manual
  desktop/mobile inspection and then remained stable across all three runs.
- Tracked-source secret heuristic found no matches.

The following task-scoped evidence provides additional depth:

- Latest database task gate: PostgreSQL 17, fresh migrated/seeded database,
  13 files / 85 tests passed at `a408209`.
- Result-time schema change: fresh, representative-upgrade, and
  production-shaped upgrade simulations passed at `e8e4c00`, including
  preservation of historical source/result evidence.
- Latest broad customer/UI evidence: 45 files / 363 tests, 18/18 typechecks,
  18/18 builds, and focused EN/EL Autopsy rendering 4/4 passed at `a408209`.
- Task 11 evidence: 135 files / 1,235 tests and History/header Playwright 4/4
  passed; the two manually reviewed localized History baselines were accepted
  in `d2674a4`.
- Task 14 evidence: full real-PostgreSQL 13 files / 84 tests, broad customer
  19 files / 140 tests, full unit/customer 134 files / 1,224 tests, all 18
  typechecks/builds, lint, and format passed.
- Final whole-release review found and rejected two Important integration
  defects. `0bebe8c` now treats persisted `RESULT_WRITE_FAILED` skips as failed
  live runs without advancing last-success time; `1109307` now selects the
  authoritative terminal result before admitting only scored FINAL rows to
  calibration and both baselines. Their real-PostgreSQL regressions and scoped
  independent re-reviews passed with no remaining findings.
- Tracked-source secret heuristic at the candidate found no matches.
- The official npm audit reports one High advisory on `sharp < 0.35.4` only
  through development dependencies
  `@cloudflare/vite-plugin -> wrangler -> miniflare`. The Vercel/Next runtime
  resolves `sharp 0.35.4`; this is a deferred, Cloudflare-tooling-only P2, not a
  reason to modify the protected Cloudflare POC during this continuation.

## Production deployment and live verification

The customer-only production redeploy completed after the clean local/remote
identity check. Vercel deployment `dpl_DYHpgooSqLcjfqeh2SDozGC1g6M4` is READY,
and an independent inspection of `https://project-cf8ty.vercel.app` resolved to
that exact deployment. GitHub's `Vercel – velyq` status for source
`10cf0ed8db980d17a4e3eeffee2f6ccc4b76906d` also points to the same deployment.

Public live verification against the stable production alias passed:

- `/`, `/today`, `/edge`, `/radar`, `/results`, `/account`, `/pricing`, and
  `/sign-in` returned 200. `/el`, `/el/pricing`, and `/el/sign-in` returned 200;
  the deliberately unsupported `/el/today` returned 404.
- `/api/health` returned 200 with production, configured/effective LIVE,
  DATABASE source, database available, synthetic fallback disabled, and
  `syntheticOnly: false`. `/api/ready` returned 200 with auth and database
  configured. Unauthenticated `/api/v1/today` returned the expected 401.
- `/today`, `/edge`, `/radar`, and `/results` contained no synthetic/demo-data
  marker. The locale cookie round trip set `velyq-locale=el` with Secure and
  SameSite=Lax and preserved a successful `/today` response.
- `/today` returned the release security policy: restrictive CSP, one-year HSTS
  with subdomains, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  strict-origin referrer policy, camera/microphone/geolocation disabled, and
  private no-store/no-cache behavior.
- No route in the release smoke set returned an unexpected 5xx.

Authenticated production QA used only the existing Brave profile, as required.
A fresh production Today tab initially rendered the authenticated shell, then
the server rejected the stored session and redirected to `/sign-in`; the
resulting sign-in page reported no console warnings/errors. No credential was
requested or entered, so authenticated fixture/page verification remains
owner-only and no real match ID is claimed without evidence. The Admin
final-source preview is READY but protected by Vercel authentication; it was
not promoted because production migration `20260928110000` has not been
applied.

## Benchmark

The final Task 14 PostgreSQL 17 run compared the frozen legacy adapter with the
shared bulk implementation over the same 100 LIVE events:

| Implementation | SQL statements | Warm samples (ms) | Median |
| --- | ---: | --- | ---: |
| Frozen legacy `getToday` | 3,101 | 1,062.67 / 1,136.39 / 1,283.47 | 1,136.39 ms |
| Bulk `getToday` | 11 | 122.61 / 118.50 / 112.73 | 118.50 ms |

That is 99.65% fewer statements and 89.6% lower median latency. Byte-for-byte
equivalence covers both corpora, historical cutoffs, 1X2 and O/U 2.5, evidence
ties, 100-event batching, and 300 UUID case variants. No index or migration was
needed for this optimization.

## Mandatory migration and deployment order

The new migration is
`supabase/migrations/20260928110000_result_observation_time_nullable.sql`. It
only drops `NOT NULL` from
`operations.source_observations.provider_observed_at` and
`intelligence.event_results.provider_observed_at`; it performs no historical
UPDATE, DELETE, or repair.

1. Inspect the production migration inventory without printing credentials.
2. Apply every pending migration in filename order through
   `20260928110000_result_observation_time_nullable.sql`. Do not cherry-pick it
   ahead of its predecessors.
3. Verify the two production columns are nullable and the migration completed
   without rewriting historical rows.
4. Only then deploy any Admin/provider writer containing `0dc965f` or later.
5. Deploy the customer app from the same verified release SHA, wait for Ready,
   verify the production alias moved, and run the runbook's live checks.

**Migration `20260928110000` must be applied before deploying the nullable
result writer.** The customer application has been deployed because its bundle
does not import the provider/result writer. The Admin/provider writer remains
Preview-only until the migration is applied and verified.

## Remaining owner-only release blockers

- Apply and verify the pending production migrations, including the earlier
  identity-invariant migration where still pending and the new
  `20260928110000` migration above.
- Confirm—without displaying values—that the Admin production environment has
  `VELYQ_SCHEDULER_SECRET`, that it matches Supabase Vault
  `velyq_scheduler_secret`, and that the live `velyq-provider-ingest` cron job
  targets the intended Admin production host. Inspect recent cron/HTTP results
  and run one controlled scheduler smoke.
- Confirm the required production database/provider variables on the same
  Admin target. `VELYQ_INGEST_SECRET` is not accepted by the scheduler route.
- Revoke the Supabase Personal Access Token previously exposed in a transcript.
- Complete authenticated customer/Admin production QA with an owner-held
  session; credentials must not be copied into release records or chat.
- Resolve the GitHub Actions account billing lock before relying on hosted CI.
  Local PostgreSQL 17 evidence remains valid, but hosted CI was not available.

## Remaining P2 and deferred work

- Persist fatal whole-run ingestion failures; add Admin odds-freshness and
  next-due diagnostics; add an Admin sign-in application rate limit.
- Make the legacy binary model-health aggregate correction-aware and clarify
  or pair the model/market baseline cohorts when historical odds are missing.
- Re-profile the odds-tail and History index shapes at production cardinality;
  batch History participant labels if measured; bound scheduler marker reads
  if multi-season growth makes them material.
- Add real-PostgreSQL parameterization for PEN and partially missing regulation
  scores. Unit coverage and production-path review already cover the behavior.
- Identify the two non-blocking sign-in 404 resource requests and add
  Safari/Firefox-specific rendering coverage when practical.
- Remediate the dev-only `sharp` advisory through the Cloudflare toolchain when
  an upstream-compatible update is available; do not alter the protected POC
  merely to silence this Vercel-release audit.
- Stripe/billing, AI/Ask VELYQ, light mode, customer search/filters, and watch
  notifications remain explicitly deferred. The complete historical backlog
  remains in [claude-product-completion-backlog.md](./claude-product-completion-backlog.md).

## VELYQ ONE customer release

The customer application now includes `VELYQ ONE`, an evidence-gated Today
selection rather than a promotional "best bet". It never manufactures or
promotes a verdict: only an already persisted `STRONG_EDGE` can qualify, and
it must still pass live-data provenance, CURRENT price freshness, OFFICIAL
lineups, A/B evidence quality, the authoritative ATTRACTIVE price policy, the
minimum acceptable price, a future kickoff on the same UTC day, and a fresh
exact-decimal edge/EV calculation at the displayed current price. If nothing
qualifies, the card explicitly reports that there is no selection right now.

The customer mapper now recalculates implied probability, probability edge,
fair odds, and expected value from the newest displayed odds. A once-strong
decision that has repriced below the decision boundary is downgraded; a
non-actionable persisted decision is never promoted. Within a fixture, verified
HOME/DRAW/AWAY candidates are compared before the legacy deterministic
fallback, preventing an actionable DRAW or AWAY outcome from being hidden
behind the first stored prediction. Global ordering is exact and stable: edge,
EV, evidence grade, kickoff, event ID, then selection.

Release verification at source
`fcd05c29880815d73d60c971e44a60998b43313e` passed:

- format, zero-warning lint, all 18 package typechecks, all 18 production
  builds, and 138 Vitest files / 1,266 tests;
- PostgreSQL 17 fresh migration/seed/integration: 14 files / 88 tests;
- representative and production-faithful upgrade reconciliation, with existing
  data preserved;
- worker readiness;
- customer Playwright 51/51 across three consecutive runs, including EN/EL,
  accessibility, visual baselines, honest empty state, selected state, and
  containment at 360, 390, 430, 736, 768, 820, 1120, 1216, 1220, 1280, 1359,
  1360, and 1440 pixels;
- Admin Playwright 5/5 on each of two independently migrated and seeded local
  PostgreSQL runs;
- independent quantitative, UX, and final source review, with no remaining
  release blocker or Important finding.

Customer preview `dpl_486j6CmfpLBqGuJKnejtXjsaatup` reached READY and was
redeployed customer-only. Production deployment
`dpl_HwdhmazkRsVdMbLGrtnvfap2YV25` is READY, and the stable alias
`https://project-cf8ty.vercel.app` resolves to that exact deployment. The
previous customer production deployment, and rollback point, is
`dpl_DYHpgooSqLcjfqeh2SDozGC1g6M4`.

Live verification passed for `/`, `/today`, `/edge`, `/radar`, `/results`,
`/account`, `/pricing`, `/sign-in`, `/api/health`, and `/api/ready` with 200;
unauthenticated `/api/v1/today` correctly returned 401. Health reported
production LIVE/DATABASE mode, database availability, and synthetic fallback
disabled. The full CSP, HSTS, clickjacking, MIME-sniffing, referrer,
permissions, and private no-store protections were present. Browser inspection
showed no console warnings/errors. The stored production customer session had
expired and safely redirected to sign-in; no credentials were requested or
entered, so authenticated live Today content remains owner-only QA.

The Admin/provider writer was not promoted. Production migration
`20260928110000_result_observation_time_nullable.sql` remains a prerequisite
for that separate deployment.

## Protected scope

Do not modify `main`, `integration/phase-1`, PR #3,
`backup/home-master-unique-20260909`, or the canonical
`cloudflare/velyq-poc` deployment/resources. No secret values belong in this
record. This continuation does not authorize Stripe, AI/OpenAI, new Vercel
projects, historical data rewrites, branch deletion, or deployment before the
gates above are satisfied.
