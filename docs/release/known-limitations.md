# Known Limitations

Factual, not aspirational. Update this file rather than letting it drift.

## Data
- **Real football data is now ingested**, from two registered providers:
  API-Sports for live fixtures and odds, and Football-Data.co.uk for the
  historical training corpus and an upcoming-fixtures feed with pre-event
  prices. `VELYQ_CUSTOMER_INTELLIGENCE_MODE=SYNTHETIC_DEMO` still switches the
  customer surfaces to the synthetic fixture path, and the synthetic badges
  remain correct for that mode — but real events, real bookmaker prices and
  real predictions exist in the database and are what the pipeline runs on.
- **No lineup data from any source.** Neither provider in use supplies
  expected or confirmed lineups. This is the single stage the decision funnel
  stops at (see Model below), so it is the highest-value gap to close.
- **Football-Data.co.uk's terms are unreviewed.** The publisher documents its
  schema but states no licence and grants no redistribution permission, so
  internal model training is treated as in scope and serving its data to
  customers is not. The registered provider policy grants
  `RETAIN_NORMALIZED` and deliberately no `DISPLAY` action, so the policy
  layer refuses a customer-facing use rather than relying on anyone
  remembering. Full detail in `docs/research/historical-data-provenance.md`.
- The corpus files are never committed. `data/historical/` is gitignored;
  re-download with `pnpm data:historical:download`.

## Model
- A **Dixon-Coles goals model now exists, is backtested, and is
  EXPERIMENTAL** — the maturity is a measured conclusion, not a placeholder.
  Fitted on 42,155 real matches across 11 competitions and 12 seasons, with
  26 walk-forward windows, an untouched 6,324-match holdout and a passing
  leakage audit. Full numbers in `docs/research/football-model-backtest.md`,
  generated from the registered artifact so it cannot drift.
- **It does not beat the market.** On holdout log loss it beats the base-rate
  baseline in 11/11 competitions on 1X2 and 9/11 on totals, roughly matches a
  ratio-Poisson baseline, and beats the de-vigged market consensus in 0/11 on
  1X2 and 2/11 on totals. That is the expected result for a first fit and it
  is the reason every decision from it is EXPERIMENTAL: where the model loses
  to the market, a positive edge it reports against a market price is more
  likely evidence that the model is worse than the market than evidence of a
  real edge. Do not represent it as validated predictive quality — the
  existing "Development heuristic" and "EXPERIMENTAL" copy remains correct.
- Both-teams-to-score is the weakest market (6/11 against base rates) and
  needed the largest calibration correction (temperature 2.30 against 1.07
  for 1X2), meaning the raw model was substantially overconfident there.
- **`decideMaturity` cannot currently return anything above EXPERIMENTAL**,
  by construction: promotion additionally requires a live forward-tested
  record, which cannot exist on the day a model is first fitted. FORTRESS
  refuses anything EXPERIMENTAL, so this model physically cannot produce a
  customer FORTRESS recommendation.

## Decision pipeline
- **The pipeline runs end to end and produces real predictions.** Verified
  against a real PostgreSQL: real prediction rows went 0 → 6 on today's real
  fixtures, unchanged across three reruns, with 12 queue jobs completed and
  none failed.
- **Zero EDGE, for a reportable reason.** Every prediction is
  `WAIT_FOR_LINEUP` on `MISSING_LINEUP`: the existing quality gate treats a
  missing lineup as disqualifying and no source in use supplies lineups. That
  gate has not been lowered. Closing this needs either a lineup feed or an
  owner-approved pre-event quality policy that grades a pre-kickoff decision
  without one — the latter is a decision-gate change and deliberately out of
  scope here.
- **Over/under stops earlier still**, at bookmaker coverage: the fixtures feed
  carries seven individual books for 1X2 and only two for totals, against a
  policy floor of three. Both-teams-to-score has no market at all in this
  source, so the model has an opinion and nothing to price it against.
- **UEFA competitions are EXPERIMENTAL and not customer-visible.** Nothing in
  the corpus is a Champions League tie, so nothing establishes that a Premier
  League attack rating and a Primeira Liga defence rating are on the same
  scale. Promoting them needs a cross-league validation that does not exist.
- The decision funnel is persisted per cycle and exposed at
  `/api/v1/admin/funnel`, so "no recommendation today" is always accompanied
  by the stage that emptied.
- The scheduled trigger lives in the **admin** application, not the customer
  one: the customer app runs on Cloudflare Workers' free ~10ms CPU budget and
  a prediction cycle is orders of magnitude past that.

## Billing
- Stripe is **disabled**. Checkout, portal and webhook code paths exist but
  are gated on configured price IDs that are not set. No live subscription
  can be sold. Do not activate Stripe live mode without a full test-mode
  lifecycle pass (signup → upgrade → downgrade → cancel → webhook
  idempotency) once test credentials exist.

## Entitlements
- **No authorized QA identity exists** for FREE/PRO/ELITE. Creating one via
  the sign-up API writes a permanent `auth.users` row to the owner's
  production Supabase project; deleting it correctly requires either the
  Supabase Dashboard (owner login) or the Admin API with the service-role
  key. This session has neither: no Supabase MCP/tool is connected, and
  requesting or using the service-role key is explicitly forbidden. Exact
  Dashboard steps for the owner are in `qa-identities.md`; the checks to run
  once identities exist are in `entitlement-qa-checklist.md`. Live
  entitlement acceptance remains **NOT EXECUTABLE** until then.

## Legal / Compliance
- No legal review has been performed on terms, privacy notice, subscription
  terms, or responsible-gambling wording. `termsBody1` explicitly still
  reads "This draft requires legal review before commercial scale" — this is
  correct and must not be silently changed.
- Data licensing/redistribution terms for a real odds/fixtures provider have
  not been reviewed (there is no provider yet).

## Worker CPU budget — resolved; the app no longer server-renders HTML

Cloudflare Workers Free allows ~10ms CPU per invocation and one SSR render of
this app cost ~16ms at the median (P99 171ms), so sustained traffic exhausted
the allowance and every HTML route returned 503 while cheap JSON routes kept
working.

**Every HTML route is now a static asset.** Public pages and the four
customer surfaces (Today, EDGE, RADAR, Account) are prerendered into the
Cloudflare asset directory; the Worker serves only `/api/*`, `/matches/:id`
and the branded 404.

Measured live:

| | before | after |
|---|---|---|
| public HTML load test | sustained 503s for 15+ min | 280/280 → 200 |
| customer HTML load test (320 requests) | n/a (was SSR) | 320/320 → 200 |
| Worker invocations for customer HTML | 1 per page view | **0** |
| `exceededResources` | 119 in a 3h window | **0** |
| API CPU | — | median 2ms, p95 4ms, max 26ms |

**Workers Paid is not required.** The API p95 of 4ms also leaves most of the
10ms allowance free for the intelligence work still to come.

### How access is enforced now
The shells contain no customer state — the prerender step refuses to write
one containing an email address, plan code, entitlement, fixture match data,
subscription/admin state or a record id. Access is enforced by the APIs the
shells call: 401 without a session (the shell navigates to sign-in), 403
without the entitlement (the shell shows the locked state). `/api/v1/today`
applies the EDGE/RADAR preview boundary itself, derived from the customer's
own entitlements — nothing the caller sends can widen it.

The middleware gate was removed from those four routes deliberately:
redirecting them at the edge would invoke the Worker on every page view —
the exact cost this removes — and would protect nothing that is in the file.
`/matches/:id` is still Worker-rendered and still gated.

### Match Intelligence is still server-rendered (deliberate)
`/matches/:id` has unbounded ids, and Cloudflare's asset layer matches exact
paths. Serving one shell for all of them would need
`not_found_handling: "single-page-application"`, which would make *every*
unmatched path return that shell — destroying the branded 404 and the API
fallthrough that the whole split depends on. Prerendering one asset per match
is not appropriate for synthetic fixtures and would not survive real ones. It
is also the lowest-volume customer route, reached by clicking a specific
match. It stays on the Worker.

### Not verified: the authenticated rendering path
The shells' loading, 401 and 403 paths are verified live. What is **not**
verified end-to-end is a signed-in customer actually rendering data through
them, because no QA identity exists (see Entitlements above). The unit suite
covers the view logic and the API's entitlement decisions; the live
authenticated render remains unproven until credentials exist.

## Infrastructure
- **Admin E2E and pgTAP tests are still NOT EXECUTABLE without Docker**:
  `pnpm db:verify` shells out to the Supabase CLI, which needs Docker, and
  Docker is not installed on this machine. pgTAP, `db lint` and the security
  advisors therefore have not run against these changes and `pnpm db:verify`
  remains the authority for them.
- **A Docker-free path now exists for everything else database-shaped.**
  `pnpm db:local` applies `supabase/migrations` and the seed to any loopback
  PostgreSQL over a small shim for the four Supabase-managed objects the
  migrations touch, and the prediction-cycle integration tests run against it
  (set `VELYQ_INTEGRATION_DATABASE_URL`; they skip when it is unset). This is
  what found the four production-blocking defects fixed this phase.
- GitHub Actions / paid CI is not provisioned. Scripts are CI-friendly
  (`pnpm verify`, deterministic typegen) but no pipeline runs them
  automatically yet.
- The live URL is `velyq-poc.joker2face1990.workers.dev` — a free Cloudflare
  subdomain, not a custom domain. This is a cosmetic/SEO concern only, not a
  functional blocker.

## Rate limiting / abuse resistance
- **Implemented this pass, with a measured caveat.** sign-in, sign-up and
  forgot-password are now limited to 6 requests/60s per client IP via
  Workers KV (`apps/web/app/rate-limit/`). There is no Cloudflare zone
  attached to this Worker's workers.dev subdomain to put a native WAF
  rate-limiting rule on, and Durable Objects (the correct distributed
  counter) require the paid Workers plan — KV is the strongest no-cost
  primitive available. **Measured live:** a sub-second burst of 7 requests
  landed 401/401/401/401/401/401/401 (KV had not yet converged across
  colos); at ~1 request/second it enforced from the first excess request
  onward (429/429/429/…). It fails open on any KV outage. Recommend
  Cloudflare Turnstile on sign-up, and/or upgrading to a Durable-Object-backed
  limiter, before public traffic at meaningful scale.
