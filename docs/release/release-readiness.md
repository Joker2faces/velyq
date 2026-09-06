# VELYQ Release Readiness

**Branch:** `cloudflare/velyq-poc`
**As of SHA:** see `release-manifest.md` for the exact commit this reflects.

## Classification

**DEMO READY.**

Not PILOT READY, not COMMERCIAL READY. The rule that decides this (see
`docs/release/data-provider-readiness.md` and `known-limitations.md`) is
simple: football data is synthetic and Stripe is disabled. Every
infrastructure, security and UX gate below can be green and the product is
still not a live betting-intelligence service — it is a fully working,
secure, honestly-labelled demo of one.

## What is actually proven, with evidence

| Area | Status | Evidence |
|---|---|---|
| Cloudflare Worker | PASS | `/api/health` = 200, live |
| Hyperdrive | PASS | `databaseSource: "hyperdrive"` on `/api/ready`; Cloudflare GraphQL query count rising across probes (6→9, then higher after this pass) |
| Supabase Auth | PASS | Bad credentials return `401 INVALID_CREDENTIALS` live; no `AUTH_NOT_CONFIGURED` |
| Synthetic authorization bypass | REMOVED | `VELYQ_SYNTHETIC_PREVIEW` absent from deployed Worker vars; `worker-configuration.test.ts` pins it |
| Unauthenticated protected API | PASS | `/api/v1/today` unauth → 401 live |
| CSRF | PASS | cross-site JSON sign-in → 403 live |
| Security headers | PASS (fixed this pass) | CSP/HSTS/X-Frame-Options/Referrer-Policy/Permissions-Policy now present on every live response — previously absent entirely on Cloudflare because `next.config.js`'s `headers()` is Node/Vercel-only and Vinext never applied it |
| Rolling "Today" | PASS (fixed this pass) | Snapshot and kickoffs are now offsets from an injected clock, not a hardcoded 2026-09-04 date; regression-tested across two arbitrary dates |
| pnpm verify | PASS | format, lint, typecheck, 470 tests, both builds |
| Customer E2E | PASS | 7/7, screenshots stable under a fixed test clock |
| Admin E2E | NOT EXECUTABLE | requires local Docker Supabase (port 54322), unavailable in this environment |
| Integration tests | NOT EXECUTABLE | same Docker dependency |
| Main branch protection | PASS (fixed this pass) | force-push and deletion disabled via GitHub API, `enforce_admins: true` |
| FREE/PRO/ELITE live entitlement QA | NOT EXECUTABLE | no authorized test identity exists; creating one would write a permanent `auth.users` row to production Supabase with no way to remove it without the service-role key (withheld by design) |

## The three hard gates to COMMERCIAL GO-LIVE (per this program's own rules)

1. **Real data.** Football fixtures and odds are synthetic. See
   `data-provider-readiness.md`.
2. **Billing.** Stripe stays disabled. No live subscription sales.
3. **Legal.** Terms/privacy/data-rights review has not happened. See
   `known-limitations.md`.

None of these are solvable by more engineering in this session — they are
procurement, payment activation, and legal-review decisions for the owner.
