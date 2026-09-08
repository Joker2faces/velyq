# Production migration reconciliation (2026-09-25 investigation)

Read this before running `supabase db push` (or any migration tool) against
the linked production project (`zvdqkmevjfwprexshpap`, see
`supabase/config.toml`).

## The collision

This branch's `20260908090000_provider_identity_and_live_data.sql` and
production's own migration history both use migration **version**
`20260908090000` -- but they are different migrations. Production's own
history (as reported directly by the project owner, not independently
verified from this environment, which has no production credentials)
records:

- `20260908090000` as `research_corpus_and_intelligence_policy` (not this
  branch's `provider_identity_and_live_data`)
- a later migration named `event_identities`, with production's recorded
  migration head at `20260908180000`

Production apparently built its own equivalent of
`catalog.competition_identities`, `catalog.event_identities`, and the
deferred event-provenance trigger this branch's `20260908090000` migration
creates -- under a different migration lineage entirely. This is
consistent with `intelligence.predictions` already having a real row in
production (which requires a resolved, provenance-checked LIVE event to
exist).

## Why this can't be resolved by just running the migrations

Supabase's migration runner tracks applied migrations by **version**
(and, in current CLI versions, a checksum of the file), not by diffing
live schema against file content. A local migration file whose version is
already recorded against a *different* file will not be silently
re-applied with different content -- most CLI versions will refuse to
proceed at all (`migration history does not match`) until the mismatch is
explicitly resolved with `supabase migration repair`. This is the correct,
safe failure mode: it stops before doing anything, rather than silently
skipping real work or erroring destructively.

**This branch has not attempted to resolve that collision file, and does
not repair or renumber production's migration history from here.** Doing
so requires comparing this branch's `20260908090000` migration's actual
DDL against production's real `research_corpus_and_intelligence_policy` +
`event_identities` migrations -- which requires production access this
environment does not have. An operator with that access must:

1. Run `supabase migration list --linked` (or equivalent) against the real
   project to see the exact recorded history.
2. Confirm, object by object, that production's
   `catalog.competition_identities` / `catalog.event_identities` /
   deferred provenance trigger are schema-equivalent to what this
   branch's `20260908090000` migration would have created (see that file,
   and the production-equivalent DDL reproduced for test purposes in
   `tooling/scripts/local-postgres-production-upgrade.mjs`).
3. Only if equivalent: mark this branch's `20260908090000_provider_
   identity_and_live_data.sql` as applied via `supabase migration repair
   --status applied 20260908090000` (or the then-current equivalent
   command) so the CLI stops trying to reconcile it, without ever
   executing its DDL against production.
4. If NOT equivalent, or a genuine gap is found (for example, no
   equivalent provenance trigger): that gap must be closed with a new,
   later-versioned, additive migration -- never by editing the colliding
   file or forcing the original one through.

## What this branch DID resolve, safely, without production access

- **`20260922090000_score_results_idempotency_key.sql`** is now
  idempotent (`IF NOT EXISTS`-guarded via `information_schema`/
  `pg_constraint` checks): production already has this exact column and
  unique index, built independently before this migration was written,
  and a bare `ADD COLUMN`/`ADD CONSTRAINT` would have failed against it.
  It is still real work against a database that genuinely lacks the
  column (fresh installs, and `test:db:upgrade`'s own older-schema
  fixture).
- **`intelligence.forecasts` / `decisions` / `event_results` /
  `market_settlements`** were genuinely missing from production. Their
  migration was renamed from `20260908120000` to
  `20260925100000_forecasts_decisions_and_settlements.sql` -- a version
  unambiguously later than production's recorded head (`20260908180000`)
  and every other migration in this branch, specifically so no migration
  tool's out-of-order handling is ever invoked. It depends only on
  `intelligence.predictions`, `market.event_market_outcomes`,
  `market.odds_observations`, `catalog.events`, and
  `operations.source_observations` -- none of the disputed
  `20260908090000` objects -- so it is safe to apply regardless of how
  the `20260908090000` collision above is ultimately resolved.
- **`pnpm test:db:production-upgrade`**
  (`tooling/scripts/local-postgres-production-upgrade.mjs`) proves both of
  the above against a schema built to match production's *reported*
  current state (shared history through
  `20260905192925_harden_private_authorization_tables.sql`, then an
  independently-authored equivalent of the identity tables/trigger, then
  `score_results.idempotency_key` added directly -- not by replaying this
  branch's disputed migration), then applies only
  `20260922090000` + `20260925100000` on top and verifies existing data
  is preserved byte-for-byte and no duplicate identities are introduced.
