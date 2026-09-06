# Operations Runbook

## Health checks
- `GET /api/health` → 200 always (process reachable)
- `GET /api/ready` → 200 means auth + database both proven this request;
  503 means one is not. `checks.databaseSource` says which DB path answered
  (`node` or `hyperdrive`).

## Live log inspection
```bash
npx wrangler tail velyq-poc --format json
```
Exercise the route(s) you're investigating in another terminal/browser while
this runs. Zero exceptions and zero unexplained non-2xx/3xx/401/403 is the
expected steady state.

## Hyperdrive proof
```bash
# Requires a Cloudflare API token/OAuth session with Analytics read access.
# GraphQL Analytics API, hyperdriveQueriesAdaptiveGroups, filtered by
# dimensions.configId == 660fd984521442f8be51b97740eb3d4a
```
A rising `count` across probe rounds is evidence Hyperdrive is actually being
queried, not merely bound.

## Common incidents
| Symptom | Likely cause | Action |
|---|---|---|
| Every HTML route 503s but `/api/health` and `/api/ready` return 200 | Workers Free CPU allowance exhausted — see `known-limitations.md` | Confirm with `wrangler tail` (`outcome: exceededCpu`). No code fix; traffic must subside or the account needs Workers Paid. Do not roll back — earlier versions hit the same ceiling. |
| `/api/ready` = 503, `databaseConfigured: false` | Hyperdrive binding missing or `wrangler.jsonc` vars wiped by a bad deploy | Redeploy from a clean checkout of `cloudflare/velyq-poc`; `vars` are declared in `wrangler.jsonc`, not the dashboard |
| Sign-in returns 500 | Regression in JSON body parsing (previously fixed in `dfafaf4`) | Check `apps/web/app/api/v1/auth/request-body.ts` wasn't reverted |
| Any route missing security headers | `proxy.ts` matcher regressed | Check `apps/web/proxy.ts`'s `config.matcher` still covers all non-static routes |
| Worker build ships wrong DB source | The Vite plugin resolving `runtime-database-source` to the Cloudflare variant broke | Run `node tooling/scripts/verify-worker-bundle.mjs apps/web/dist/server` — it fails loudly if this regresses |

## Deploy procedure
```bash
cd apps/web
pnpm build:vinext
node ../../tooling/scripts/verify-worker-bundle.mjs dist/server   # must print OK
pnpm deploy:vinext
curl -s https://velyq-poc.joker2face1990.workers.dev/api/health
curl -s https://velyq-poc.joker2face1990.workers.dev/api/ready
```
Never deploy uncommitted code. Confirm `git rev-parse HEAD` equals
`git rev-parse origin/cloudflare/velyq-poc` before deploying.
