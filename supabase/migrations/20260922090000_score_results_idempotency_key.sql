-- The Drizzle schema (packages/database/src/schema/intelligence.ts) has
-- declared `intelligence.score_results.idempotency_key` (notNull, unique)
-- since before this migration existed, but no migration ever created the
-- column: the statement that originally created score_results, in
-- 20260903102351_phase_1_foundation.sql, never included it. Every query
-- selecting `score_results.*` (e.g. the customer Today/match read model)
-- has therefore always failed against a real database whenever it
-- actually reached this table -- masked until now because nothing in the
-- test suite had ever inserted a score_results row and then read a
-- match/today response back through the real DatabaseCustomerQueryAdapter
-- in the same test run.
--
-- A generated default (rather than requiring every existing/seeded row to
-- supply one) is what lets this migration land at two different points in
-- supabase/seed.sql's own lifecycle without editing seed.sql itself:
-- test:db:local applies every migration (this one included) before
-- seed.sql runs, so seed's plain INSERT already gets a default value for
-- free; test:db:upgrade applies seed.sql at an older schema snapshot,
-- before this migration exists at all, then applies this migration
-- afterward against the now-non-empty table, where the same default
-- backfills the seeded rows. Nothing in the application currently writes
-- to score_results (the scoring feature itself is not yet built), so no
-- real caller's idempotency semantics are weakened by the default; a
-- future writer of this table should still supply its own meaningful
-- idempotency key explicitly rather than rely on it.
ALTER TABLE "intelligence"."score_results"
	ADD COLUMN "idempotency_key" text NOT NULL DEFAULT gen_random_uuid()::text;
--> statement-breakpoint
ALTER TABLE "intelligence"."score_results"
	ADD CONSTRAINT "score_results_idempotency_key_unique" UNIQUE ("idempotency_key");
