# Security Review — Master Release Program pass

## Findings fixed this pass
1. **Missing security headers on Cloudflare** (P1). `next.config.js`'s
   `headers()` never applied on the deployed Worker (Vinext doesn't read
   Next config). Fixed via `proxy.ts` applying CSP/HSTS/X-Frame-Options/
   Referrer-Policy/Permissions-Policy to every response, verified live.
2. **Main branch unprotected** (P2). Force-push and deletion now disabled
   via GitHub branch protection API.

## Findings confirmed clean (no action needed)
- No secrets in tracked source (`service_role`, `sb_secret_`, connection
  strings with embedded credentials) — heuristic grep across the repo found
  none; only key **names** appear in schema/type definitions and tests.
- `VELYQ_SYNTHETIC_PREVIEW` confirmed absent from the deployed Worker's vars
  and pinned there by `worker-configuration.test.ts`.
- Unauthenticated protected API → 401; protected page → 307 redirect to
  sign-in; cross-site JSON sign-in → 403 (CSRF).
- Admin separation: entitlement/plan logic and `admin.access` are resolved
  from separate DB tables (`subscriptions` vs. `role_permissions`); no
  email-based admin check exists in the auth code paths reviewed.
- No `open redirect`: `signInUrl()` only ever derives a redirect target from
  `VELYQ_APPLICATION_ORIGIN` (a server-controlled env var) when it is set,
  which it is in the deployed config — request-controlled input is never
  used to build the redirect in that branch.

## Not executed (scope requires resources unavailable in this pass)
- **Dependency vulnerability scan** (`pnpm audit` / equivalent) — not run
  this pass; recommend running it before the next release and triaging any
  Critical/High findings that are reachable at runtime.
- **Rate limiting on auth endpoints** — not implemented; Cloudflare Free
  tier has no configurable rate-limiting rules. Documented as an action item
  in `known-limitations.md`.
- **Full penetration-style adversarial pass** (session fixation, replay,
  timing attacks) — the specific IDOR/CSRF/unauth checks in this report were
  run live and passed; a dedicated red-team pass was not performed.
