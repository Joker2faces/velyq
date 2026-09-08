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

## Update: actual production DDL, verified read-only (supersedes the
## "equivalent schema" assumption below and in the original commit)

The owner has since supplied actual, read-only-verified DDL for
production's legacy identity tables. They are **not** schema-equivalent to
this branch's provider-centric design -- the earlier assumption in this
document (and in `local-postgres-production-upgrade.mjs`'s first version)
that production built an equivalent of `competition_id`/`provider_id`/
`provider_competition_id`/etc. under different migration names was wrong.
The real, verified shape is:

- `catalog.competition_identities`: `id, canonical_code, source_code,
  source_key, source_name, country_code, created_at`;
  `UNIQUE(source_code, source_key)`; `INDEX(canonical_code)`. None of this
  branch's `competition_id`/`provider_id`/`provider_competition_id`/
  `display_name`/`mapping_status`/`mapping_confidence`/`verified_at`.
- `catalog.event_identities`: `id, event_id, source_code, source_key,
  created_at`; `UNIQUE(source_code, source_key)`;
  `UNIQUE(event_id, source_code)`; FK `event_id -> catalog.events`. None of
  `provider_id`/`provider_fixture_id`.
- **No event-provenance trigger of any kind currently exists in
  production** -- not this branch's, not an equivalent. `catalog.events`
  only has `CHECK (synthetic IN (true, false))`.
- `operations.providers` already has real rows for `API_SPORTS`,
  `FOOTBALL_DATA_UK`, and `SYNTHETIC_FIXTURES` -- `source_code` is the
  provider's own code, so `provider_id` backfills deterministically via
  `operations.providers.code`, no guessing required.
- `canonical_code` uses `@velyq/research`'s own model-competition-key
  space (`packages/research/src/competitions.ts`'s
  `CompetitionPolicyEntry.canonicalCode`, e.g. `"ITA_SERIE_A"`) -- **not**
  `catalog.competitions.code` (an unrelated internal slug, e.g.
  `"serie-a"`). Two real production examples (`ITA_SERIE_A -> serie-a`,
  `ESP_LA_LIGA -> la-liga`) independently confirm the same deterministic
  transform (strip the 3-letter country prefix, lowercase, underscore ->
  dash), which is what the new compatibility migration uses to link
  `competition_id` to an *existing* `catalog.competitions` row -- it never
  fabricates one, and never guesses past a transform that finds no match.

**A real, separate bug this surfaced and fixed**: the forecast-cycle
adapter (`packages/database/src/repositories/forecast-cycle-adapter.ts`)
was reading `catalog.competitions.code` as the model competition key --
which happened to work for this session's own fresh-install test fixtures
(which deliberately use matching codes on both sides) but is wrong for
real production data, where the two code spaces are unrelated. Fixed to
read `competition_identities.canonical_code` (added to this branch's own
schema too, nullable, for parity), falling back to `competitions.code`
only when no identity row supplies a canonical code at all.

## What this branch resolved, safely, without production access

- **`20260925110000_legacy_identity_compatibility.sql`** (new): adds this
  branch's required columns to production's real legacy tables --
  `competition_id`, `provider_id`, `provider_competition_id`,
  `display_name`, `mapping_status`, `mapping_confidence`, `verified_at` on
  `competition_identities`; `provider_id`, `provider_fixture_id` on
  `event_identities`; `canonical_code` on `competition_identities` (for a
  fresh install, which never had it). Backfills `provider_id` /
  `provider_competition_id` / `provider_fixture_id` / `display_name`
  deterministically from the legacy columns; backfills `competition_id`
  only via the twice-confirmed `canonical_code` transform above; **never
  marks a backfilled row `mapping_status = 'CONFIRMED'`** -- every row
  becomes `PENDING_REVIEW`, since this migration has no way to
  independently re-verify a mapping was resolved correctly, only that a
  legacy row already existed. Also relaxes production's legacy
  `NOT NULL` constraints on `source_code`/`source_key`/`source_name`/
  `canonical_code` (a safe, non-destructive loosening: it cannot alter or
  violate any existing row's real value) so a row written going forward
  by this branch's own code -- which knows nothing about those columns --
  can coexist with legacy rows in the same table. Adds the deferred
  provenance trigger only after a live, at-apply-time check finds zero
  LIVE events with no matching identity row; otherwise logs the orphan
  count and skips it, leaving the rest of the migration intact.
- **`20260922090000_score_results_idempotency_key.sql`** is idempotent
  (`IF NOT EXISTS`-guarded via `information_schema`/`pg_constraint`
  checks): production already has this exact column and unique index,
  built independently before this migration was written, and a bare
  `ADD COLUMN`/`ADD CONSTRAINT` would have failed against it. Still real
  work against a database that genuinely lacks the column (fresh installs,
  and `test:db:upgrade`'s own older-schema fixture).
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
  (`tooling/scripts/local-postgres-production-upgrade.mjs`) now models the
  ACTUAL verified legacy schema above (not the earlier, incorrect
  provider-centric proxy), seeds representative legacy rows, applies only
  `20260925110000` + `20260922090000` + `20260925100000` in release order,
  and verifies: the release tables exist; legacy columns are untouched and
  still readable; the new columns are backfilled correctly with no row
  marked `CONFIRMED`; the provenance trigger is enabled (this fixture has
  zero orphan LIVE events); every pre-existing row survives byte-for-byte;
  no duplicate identities are introduced; and the full DB-integration
  suite (fixture ingestion, odds ingestion, forecast cycle, settlement,
  history) passes against the reconciled schema.

## Known gap, stated plainly

This session did not construct a second scenario proving the provenance
trigger is correctly *skipped* when an orphan LIVE event exists (only that
it is correctly *enabled* when none do) -- the guard's logic is a plain,
easily-audited `IF orphan_count > 0 THEN ... RETURN` in
`20260925110000`'s own SQL, but the automated test coverage only exercises
the zero-orphan branch. Before actually applying this migration to
production, an operator with access should run the orphan-count query
from that migration by hand first and confirm it returns zero, rather than
relying on the migration's own skip-logic as the only safety net.
