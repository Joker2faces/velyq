-- Close the two identity invariants without rewriting legacy production data.
-- PostgreSQL enforces NOT VALID checks for every future INSERT/UPDATE while
-- allowing already-known violations to remain available for reviewed repair.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'competition_identities_confirmed_requires_catalog'
      AND connamespace = 'catalog'::regnamespace
  ) THEN
    ALTER TABLE catalog.competition_identities
      ADD CONSTRAINT competition_identities_confirmed_requires_catalog
      CHECK (mapping_status <> 'CONFIRMED' OR competition_id IS NOT NULL)
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM catalog.competition_identities
    WHERE mapping_status = 'CONFIRMED' AND competition_id IS NULL
  ) THEN
    ALTER TABLE catalog.competition_identities
      VALIDATE CONSTRAINT competition_identities_confirmed_requires_catalog;
  END IF;
END;
$$;

-- A constraint trigger only evaluates rows written after it exists. Existing
-- legacy orphans therefore do not need to be relabelled, deleted, or guessed
-- away before the database can reject every newly-created LIVE orphan.
CREATE OR REPLACE FUNCTION catalog.enforce_event_provenance()
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
      MESSAGE = format(
        'catalog.events %s has synthetic = false with no catalog.event_identities row',
        NEW.id
      );
  END IF;
  RETURN NEW;
END;
$BODY$;

REVOKE ALL ON FUNCTION catalog.enforce_event_provenance() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION catalog.enforce_event_provenance() TO postgres, service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'events_provenance_required'
      AND tgrelid = 'catalog.events'::regclass
  ) THEN
    CREATE CONSTRAINT TRIGGER events_provenance_required
    AFTER INSERT OR UPDATE OF synthetic ON catalog.events
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION catalog.enforce_event_provenance();
  END IF;
END;
$$;
