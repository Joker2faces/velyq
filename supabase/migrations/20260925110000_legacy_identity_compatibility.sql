-- Forward-only, additive compatibility migration bringing production's
-- ALREADY-EXISTING legacy identity tables (built under a different
-- migration lineage than this branch's, hence the version collision
-- documented in 20260908090000_provider_identity_and_live_data.sql and
-- supabase/PRODUCTION_MIGRATION_RECONCILIATION.md) up to the shape this
-- branch's application code requires -- WITHOUT dropping, renaming, or
-- otherwise touching the legacy columns those objects still carry.
--
-- Verified (read-only) production shape being reconciled against:
--   catalog.competition_identities: id, canonical_code, source_code,
--     source_key, source_name, country_code, created_at;
--     UNIQUE(source_code, source_key); INDEX(canonical_code).
--   catalog.event_identities: id, event_id, source_code, source_key,
--     created_at; UNIQUE(source_code, source_key);
--     UNIQUE(event_id, source_code); FK event_id -> catalog.events.
--   operations.providers already contains API_SPORTS / FOOTBALL_DATA_UK /
--     SYNTHETIC_FIXTURES with real ids -- source_code is provider CODE,
--     not a raw label, so provider_id backfills deterministically via
--     operations.providers.code with no guessing.
--   No event-provenance trigger currently exists in production.

-- ============================================================
-- 1. competition_identities: add branch-required columns, backfill
-- ============================================================
-- canonical_code already exists in production (a legacy column, never
-- touched above) -- added here only for a fresh install, whose
-- 20260908090000_provider_identity_and_live_data.sql never included it.
ALTER TABLE "catalog"."competition_identities"
  ADD COLUMN IF NOT EXISTS "canonical_code" text;

-- Production's legacy source_code/source_key/source_name/canonical_code
-- are NOT NULL there -- but this branch's own write path
-- (ingestFootballFixture and friends) has no concept of them and will
-- never populate them on a NEW row. Relaxing NOT NULL is a safe,
-- non-destructive constraint change (it cannot violate or alter any
-- existing row's real, already-NOT-NULL value) and is what lets a legacy
-- row and a row written by this branch's code coexist in the same table
-- going forward. Existing legacy data keeps its values -- this only stops
-- future inserts that don't know about these columns from being rejected.
ALTER TABLE "catalog"."competition_identities"
  ALTER COLUMN "canonical_code" DROP NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'catalog' AND table_name = 'competition_identities'
      AND column_name = 'source_code'
  ) THEN
    ALTER TABLE "catalog"."competition_identities"
      ALTER COLUMN "source_code" DROP NOT NULL,
      ALTER COLUMN "source_key" DROP NOT NULL,
      ALTER COLUMN "source_name" DROP NOT NULL;
  END IF;
END;
$$;

ALTER TABLE "catalog"."competition_identities"
  ADD COLUMN IF NOT EXISTS "competition_id" uuid,
  ADD COLUMN IF NOT EXISTS "provider_id" uuid,
  ADD COLUMN IF NOT EXISTS "provider_competition_id" text,
  ADD COLUMN IF NOT EXISTS "display_name" text,
  ADD COLUMN IF NOT EXISTS "mapping_status" text,
  ADD COLUMN IF NOT EXISTS "mapping_confidence" numeric(4, 3),
  ADD COLUMN IF NOT EXISTS "verified_at" timestamp with time zone;

-- Both backfill UPDATEs below reference legacy columns (source_code,
-- source_key, source_name, canonical_code) that do not exist at all on a
-- fresh install (only 20260908090000's provider-centric columns do,
-- already NOT NULL and therefore never NULL to begin with) -- a plain
-- UPDATE naming a nonexistent column fails at parse time regardless of
-- how many rows would match, so this runs as dynamic SQL, only when the
-- legacy columns are actually present.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'catalog' AND table_name = 'competition_identities'
      AND column_name = 'source_code'
  ) THEN
    EXECUTE $sql$
      UPDATE "catalog"."competition_identities" ci
      SET
        "provider_id" = p.id,
        "provider_competition_id" = ci.source_key,
        "display_name" = ci.source_name,
        -- Every legacy row was resolved by a real, reviewed process (it
        -- already carries a canonical_code) -- but this migration has no
        -- way to independently re-verify that resolution against live
        -- provider data, so it is deliberately NOT marked CONFIRMED here.
        -- An operator with production access reviews and flips these
        -- explicitly; see supabase/PRODUCTION_MIGRATION_RECONCILIATION.md.
        "mapping_status" = 'PENDING_REVIEW'
      FROM "operations"."providers" p
      WHERE p.code = ci.source_code
        AND ci."provider_id" IS NULL
    $sql$;

    -- competition_id: linked ONLY where a deterministic, twice-
    -- independently-confirmed transform of canonical_code (strip the
    -- 3-letter country prefix, lowercase, underscore -> dash -- e.g.
    -- ITA_SERIE_A -> serie-a, ESP_LA_LIGA -> la-liga, both confirmed
    -- against real production values) resolves to an EXISTING
    -- catalog.competitions row. Never fabricates a new competitions row,
    -- and never guesses past a transform that finds no match -- those
    -- rows keep competition_id NULL and mapping_status stays
    -- PENDING_REVIEW, which is the honest state until reviewed.
    EXECUTE $sql$
      UPDATE "catalog"."competition_identities" ci
      SET "competition_id" = c.id
      FROM "catalog"."competitions" c
      WHERE ci."competition_id" IS NULL
        AND ci."canonical_code" IS NOT NULL
        AND c.code = lower(
          regexp_replace(regexp_replace(ci.canonical_code, '^[A-Za-z]{3}_', ''), '_', '-', 'g')
        )
    $sql$;
  END IF;
END;
$$;

ALTER TABLE "catalog"."competition_identities"
  ALTER COLUMN "provider_id" SET NOT NULL,
  ALTER COLUMN "provider_competition_id" SET NOT NULL,
  ALTER COLUMN "display_name" SET NOT NULL,
  ALTER COLUMN "mapping_status" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'competition_identities_provider_identity_unique'
      AND connamespace = 'catalog'::regnamespace
  ) THEN
    ALTER TABLE "catalog"."competition_identities"
      ADD CONSTRAINT "competition_identities_provider_identity_unique"
        UNIQUE ("provider_id", "provider_competition_id");
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'competition_identities_mapping_status_check'
      AND connamespace = 'catalog'::regnamespace
  ) THEN
    ALTER TABLE "catalog"."competition_identities"
      ADD CONSTRAINT "competition_identities_mapping_status_check"
        CHECK (mapping_status in ('CONFIRMED', 'PENDING_REVIEW', 'REJECTED'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'competition_identities_confidence_range_check'
      AND connamespace = 'catalog'::regnamespace
  ) THEN
    ALTER TABLE "catalog"."competition_identities"
      ADD CONSTRAINT "competition_identities_confidence_range_check"
        CHECK (mapping_confidence is null or (mapping_confidence >= 0 and mapping_confidence <= 1));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'competition_identities_competition_id_competitions_id_fk'
  ) THEN
    ALTER TABLE "catalog"."competition_identities"
      ADD CONSTRAINT "competition_identities_competition_id_competitions_id_fk"
        FOREIGN KEY ("competition_id") REFERENCES "catalog"."competitions"("id") ON DELETE restrict;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'competition_identities_provider_id_providers_id_fk'
  ) THEN
    ALTER TABLE "catalog"."competition_identities"
      ADD CONSTRAINT "competition_identities_provider_id_providers_id_fk"
        FOREIGN KEY ("provider_id") REFERENCES "operations"."providers"("id") ON DELETE restrict;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS "competition_identities_competition_id_idx"
  ON "catalog"."competition_identities" USING btree ("competition_id");

REVOKE ALL ON "catalog"."competition_identities" FROM anon, authenticated;

-- ============================================================
-- 2. event_identities: add branch-required columns, backfill
-- ============================================================
ALTER TABLE "catalog"."event_identities"
  ADD COLUMN IF NOT EXISTS "provider_id" uuid,
  ADD COLUMN IF NOT EXISTS "provider_fixture_id" text;

-- Same reasoning as competition_identities' legacy columns above:
-- production's source_code/source_key are NOT NULL there, but this
-- branch's write path never populates them on a new row. Relaxing NOT
-- NULL cannot alter or violate any existing row's real value.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'catalog' AND table_name = 'event_identities'
      AND column_name = 'source_code'
  ) THEN
    ALTER TABLE "catalog"."event_identities"
      ALTER COLUMN "source_code" DROP NOT NULL,
      ALTER COLUMN "source_key" DROP NOT NULL;
  END IF;
END;
$$;

-- Same reasoning as competition_identities above: source_code/source_key
-- do not exist at all on a fresh install, so this backfill only runs as
-- dynamic SQL when they are actually present.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'catalog' AND table_name = 'event_identities'
      AND column_name = 'source_code'
  ) THEN
    EXECUTE $sql$
      UPDATE "catalog"."event_identities" ei
      SET
        "provider_id" = p.id,
        "provider_fixture_id" = ei.source_key
      FROM "operations"."providers" p
      WHERE p.code = ei.source_code
        AND ei."provider_id" IS NULL
    $sql$;
  END IF;
END;
$$;

ALTER TABLE "catalog"."event_identities"
  ALTER COLUMN "provider_id" SET NOT NULL,
  ALTER COLUMN "provider_fixture_id" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'event_identities_provider_identity_unique'
      AND connamespace = 'catalog'::regnamespace
  ) THEN
    ALTER TABLE "catalog"."event_identities"
      ADD CONSTRAINT "event_identities_provider_identity_unique"
        UNIQUE ("provider_id", "provider_fixture_id");
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'event_identities_event_provider_unique'
      AND connamespace = 'catalog'::regnamespace
  ) THEN
    ALTER TABLE "catalog"."event_identities"
      ADD CONSTRAINT "event_identities_event_provider_unique"
        UNIQUE ("event_id", "provider_id");
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'event_identities_provider_id_providers_id_fk'
  ) THEN
    ALTER TABLE "catalog"."event_identities"
      ADD CONSTRAINT "event_identities_provider_id_providers_id_fk"
        FOREIGN KEY ("provider_id") REFERENCES "operations"."providers"("id") ON DELETE restrict;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS "event_identities_event_id_idx"
  ON "catalog"."event_identities" USING btree ("event_id");

REVOKE ALL ON "catalog"."event_identities" FROM anon, authenticated;

-- ============================================================
-- 3. Deferred LIVE event-provenance trigger -- added ONLY if every
--    current LIVE event already has a matching event_identities row.
--    Never added blind: enabling a constraint that would immediately
--    reject existing data is exactly the outage this guard exists to
--    prevent. If orphans are found, the migration logs how many and
--    skips the trigger rather than failing the whole migration --
--    forecast history and identity compatibility above still land.
-- ============================================================
DO $$
DECLARE
  orphan_count integer;
BEGIN
  SELECT count(*) INTO orphan_count
  FROM catalog.events e
  WHERE e.synthetic = false
    AND NOT EXISTS (
      SELECT 1 FROM catalog.event_identities ei WHERE ei.event_id = e.id
    );

  IF orphan_count > 0 THEN
    RAISE NOTICE 'Skipping events_provenance_required: % LIVE event(s) have no catalog.event_identities row. Remediate those rows, then add the trigger in a later migration.', orphan_count;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'enforce_event_provenance' AND pronamespace = 'catalog'::regnamespace
  ) THEN
    CREATE FUNCTION catalog.enforce_event_provenance()
    RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = pg_catalog
    AS $BODY$
    BEGIN
      IF NEW.synthetic = false AND NOT EXISTS (
        SELECT 1 FROM catalog.event_identities WHERE event_id = NEW.id
      ) THEN
        RAISE EXCEPTION USING
          ERRCODE = '23514',
          MESSAGE = format('catalog.events %s has synthetic = false with no catalog.event_identities row', NEW.id);
      END IF;
      RETURN NEW;
    END;
    $BODY$;
    REVOKE ALL ON FUNCTION catalog.enforce_event_provenance() FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION catalog.enforce_event_provenance() TO postgres, service_role;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'events_provenance_required'
  ) THEN
    CREATE CONSTRAINT TRIGGER events_provenance_required
    AFTER INSERT OR UPDATE OF synthetic ON catalog.events
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION catalog.enforce_event_provenance();
  END IF;
END;
$$;
