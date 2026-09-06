# Rollback

## Cloudflare Worker

Every deploy creates a new immutable Worker version. To roll back:

```bash
npx wrangler versions list --name velyq-poc
npx wrangler versions deploy <previous-version-id>@100% --name velyq-poc
```

Verify immediately after:
```bash
curl -s https://velyq-poc.joker2face1990.workers.dev/api/health
curl -s https://velyq-poc.joker2face1990.workers.dev/api/ready
```
Both must return 200. If `/api/ready` reports `databaseSource` missing or
`databaseConfigured: false`, the rolled-back version predates the Hyperdrive
fix (pre `8da2527`) — do not roll back further than that commit.

## Worker configuration (vars/bindings)

`apps/web/wrangler.jsonc` is the source of truth for vars and the Hyperdrive
binding. A version rollback does **not** revert `vars` — those are set at
deploy time from whatever `wrangler.jsonc` looked like at deploy time, and
are NOT versioned per-Worker-version the way code is. If you roll back code
without redeploying, vars stay as they currently are. If in doubt, redeploy
from the target commit rather than using `versions deploy` alone.

## Database (Supabase / Hyperdrive)

No schema migrations were made in this program. Nothing to roll back on the
database side from this work. Standard Supabase point-in-time recovery
applies for anything unrelated.

## Git

Rolling back a branch:
```bash
git revert <bad-commit>   # preferred — never rewrite pushed history
```
`main` now has `allow_force_pushes: false` and `allow_deletions: false` —
force-push rollback on `main` is not possible even by mistake.
