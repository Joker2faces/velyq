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

## Worker CPU budget — resolved by moving HTML off the Worker

**Previously the top blocker; now fixed.** Cloudflare Workers Free allows
~10ms CPU per invocation and one SSR render of this app cost ~16ms at the
median (P99 171ms), so sustained traffic exhausted the allowance and every
HTML route returned 503 while cheap JSON routes kept working.

Public pages are now prerendered into the Cloudflare asset directory at build
time, so the asset layer serves them and the Worker is never invoked.
Measured on the live deployment:

| | before | after |
|---|---|---|
| 240–280 HTML request load test | sustained 503s for 15+ minutes | 280/280 → 200 |
| Worker invocations for HTML | 1 per page view | 0 |
| `exceededResources` | 119 in a 3h window | 0 |

The Worker still serves `/api/*`, the authenticated routes (`/today`,
`/edge`, `/radar`, `/account`, `/matches/:id`) and the branded 404 — 14
invocations covered 280 HTML plus 17 API requests in the final run, at a
median 6ms CPU.

**Workers Paid is no longer required for the current application.**

### What this cost architecturally
- Locale moved into the URL for public pages: English keeps the canonical
  paths, Greek lives under `/el`. A static file is byte-identical for every
  visitor, so it cannot read the locale cookie. A returning Greek visitor who
  lands on a canonical URL is redirected client-side to the `/el` copy.
- The auth `?error=` banner is decided in the browser, since one static file
  answers `/sign-in` and `/sign-in?error=invalid` alike. It preserves the
  outage-vs-credential distinction and re-applies the ARIA wiring.
- Security headers are generated into `_headers` as well as `proxy.ts`,
  because a static response never reaches the Worker. Both come from one
  list and a test pins them together.

### Remaining caveat (§14, rolling Today)
The homepage's synthetic preview is rendered at build time, so its three
kickoff *times* are fixed until the next deploy. No date is shown anywhere on
it, so there is nothing that visibly goes stale. The authenticated `/today`
page — the one that displays an actual date — is still Worker-rendered and
remains fully rolling.

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
