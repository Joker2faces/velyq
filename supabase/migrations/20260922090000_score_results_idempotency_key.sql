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
-- Made defensive/idempotent (checked, not assumed) after discovering the
-- actual production database already carries this exact column and unique
-- index -- built independently, outside this branch's migration lineage,
-- before this migration was written. A bare `ADD COLUMN`/`ADD CONSTRAINT`
-- would fail outright against that database. Guarding on
-- information_schema/pg_constraint makes this migration a correct no-op
-- there, while still doing real work against a fresh database or any
-- other environment that genuinely lacks the column, including the
-- generated-default backfill behavior test:db:upgrade depends on (see
-- below) for the seeded rows in supabase/seed.sql.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'intelligence'
      AND table_name = 'score_results'
      AND column_name = 'idempotency_key'
  ) THEN
    ALTER TABLE "intelligence"."score_results"
      ADD COLUMN "idempotency_key" text NOT NULL DEFAULT gen_random_uuid()::text;
  END IF;
END;
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'score_results_idempotency_key_unique'
      AND connamespace = 'intelligence'::regnamespace
  ) THEN
    ALTER TABLE "intelligence"."score_results"
      ADD CONSTRAINT "score_results_idempotency_key_unique" UNIQUE ("idempotency_key");
  END IF;
END;
$$;
