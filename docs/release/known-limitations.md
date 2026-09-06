# Known Limitations

Factual, not aspirational. Update this file rather than letting it drift.

## Data
- **Football data is 100% synthetic.** `VELYQ_CUSTOMER_INTELLIGENCE_MODE=SYNTHETIC_DEMO`.
  No real fixtures, odds, lineups or results anywhere in the product.
  `syntheticLabel: "Synthetic data"` and "Development heuristic" badges are
  present on every data surface — do not remove them without a real feed
  behind the claim.
- The demo snapshot now rolls with the real clock (fixed 2026-09-06); before
  this pass it was frozen at 2026-09-04 and drifted into the visible past.

## Model
- The prediction model is **EXPERIMENTAL** and has not been backtested,
  calibrated, or benchmarked against market/no-vig baselines. No Brier
  score, log-loss, or out-of-sample validation exists. Do not represent it
  as validated predictive quality anywhere in product copy — the current
  copy already avoids this correctly ("Development heuristic",
  "EXPERIMENTAL").

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
- **Admin E2E and integration tests are NOT EXECUTABLE in this environment**:
  both require a local Docker-based Supabase Postgres on `127.0.0.1:54322`,
  and Docker is not installed on this machine. `pnpm test` (unit, 470 tests)
  and customer E2E (7/7) both run and pass without Docker.
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
