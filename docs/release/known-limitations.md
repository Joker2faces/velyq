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
- **No authorized QA identity exists** for FREE/PRO/ELITE. Self-registering
  one would write a permanent `auth.users` row to the owner's production
  Supabase project that cannot be removed without the service-role key,
  which this program is explicitly forbidden from requesting or using. Live
  entitlement acceptance (FREE preview/PRO full/ELITE match access) is
  therefore **NOT EXECUTABLE** until the owner provisions test accounts or
  supplies credentials.

## Legal / Compliance
- No legal review has been performed on terms, privacy notice, subscription
  terms, or responsible-gambling wording. `termsBody1` explicitly still
  reads "This draft requires legal review before commercial scale" — this is
  correct and must not be silently changed.
- Data licensing/redistribution terms for a real odds/fixtures provider have
  not been reviewed (there is no provider yet).

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
- No explicit rate limiting is configured on `/api/v1/auth/*` beyond
  whatever Cloudflare's platform-level DDoS/bot protections provide by
  default on the Free plan. Cloudflare's paid rate-limiting rules were not
  enabled (would require a paid plan). Recommend Cloudflare Turnstile or a
  Workers-native rate limiter (e.g. Durable Object token bucket) before
  public, unauthenticated sign-up traffic at any real scale.
