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

## Worker CPU budget — the top operational constraint

**This is currently the single biggest limitation, and it is a plan limit,
not a code defect.**

Measured on the live Worker (Cloudflare GraphQL `workersInvocationsAdaptive`,
CPU in microseconds):

| bucket | requests | cpuTime P50 | cpuTime P99 |
|---|---|---|---|
| `success` | 913 | 16,051µs (16ms) | 171,031µs (171ms) |
| `exceededResources` | 119 | 10,000µs (exactly the cap) | 16,531µs |

The account has **no Workers paid subscription** (`/accounts/…/workers/subscription`
returns null), so it is on the Workers Free CPU allowance of ~10ms. A single
SSR page render for this app costs ~16ms at the median. Individual renders
burst above the cap fine while budget remains, but sustained traffic exhausts
the rolling allowance and then **every HTML route returns 503** while cheap
JSON routes (`/api/health`, `/api/ready`) keep returning 200 — a distinctive
signature worth recognising during an incident.

Observed during this QA pass: roughly 70–200 paced page loads were enough to
exhaust it, after which `/` returned 503 continuously for 15+ minutes while
`/api/health` and `/api/ready` stayed 200 throughout. `wrangler tail` reports
`"outcome": "exceededCpu"` with `"Worker exceeded CPU time limit."`.

This is not fixable by ordinary tuning: even `/terms`, a nearly empty page,
exceeds the budget, so the cost is Next.js SSR baseline rather than any one
page's content.

Remedies, in order of practicality:
1. **Workers Paid ($5/mo)** — raises the per-request CPU limit to 30s. One
   click, no code change, no regression risk. This is the recommended fix.
2. **Prerender the public routes as static assets** — near-zero CPU, stays on
   the free plan, but needs per-locale static builds plus a rewrite because
   i18n is currently a per-request cookie read. Days of work and real
   regression risk.
3. Edge-caching the HTML was considered and rejected: locale lives in a
   cookie, and Cloudflare does not reliably honour `Vary: Cookie`, so a cache
   could serve Greek pages to English visitors.

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
