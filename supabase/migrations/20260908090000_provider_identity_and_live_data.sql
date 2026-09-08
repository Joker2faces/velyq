-- Generated Drizzle schema delta (catalog.competition_identities, catalog.event_identities),
-- hand-appended provenance enforcement (VELYQ_INGEST engineering decision, 2026-09-08:
-- lift the Phase 1 synthetic-only boundary so real provider fixtures can be stored).

CREATE TABLE "catalog"."competition_identities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "competition_id" uuid,
  "provider_id" uuid NOT NULL,
  "provider_competition_id" text NOT NULL,
  "display_name" text NOT NULL,
  "country_code" char(2),
  "mapping_status" text NOT NULL,
  "mapping_confidence" numeric(4, 3),
  "verified_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "competition_identities_provider_identity_unique" UNIQUE("provider_id","provider_competition_id"),
  CONSTRAINT "competition_identities_mapping_status_check" CHECK ("catalog"."competition_identities"."mapping_status" in ('CONFIRMED', 'PENDING_REVIEW', 'REJECTED')),
  CONSTRAINT "competition_identities_confidence_range_check" CHECK ("catalog"."competition_identities"."mapping_confidence" is null or ("catalog"."competition_identities"."mapping_confidence" >= 0 and "catalog"."competition_identities"."mapping_confidence" <= 1))
);
ALTER TABLE "catalog"."competition_identities" ADD CONSTRAINT "competition_identities_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "catalog"."competitions"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "catalog"."competition_identities" ADD CONSTRAINT "competition_identities_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "operations"."providers"("id") ON DELETE restrict ON UPDATE no action;
CREATE INDEX "competition_identities_competition_id_idx" ON "catalog"."competition_identities" USING btree ("competition_id");
REVOKE ALL ON "catalog"."competition_identities" FROM anon, authenticated;

CREATE TABLE "catalog"."event_identities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "event_id" uuid NOT NULL,
  "provider_id" uuid NOT NULL,
  "provider_fixture_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "event_identities_provider_identity_unique" UNIQUE("provider_id","provider_fixture_id"),
  CONSTRAINT "event_identities_event_provider_unique" UNIQUE("event_id","provider_id")
);
ALTER TABLE "catalog"."event_identities" ADD CONSTRAINT "event_identities_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "catalog"."events"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "catalog"."event_identities" ADD CONSTRAINT "event_identities_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "operations"."providers"("id") ON DELETE restrict ON UPDATE no action;
CREATE INDEX "event_identities_event_id_idx" ON "catalog"."event_identities" USING btree ("event_id");
REVOKE ALL ON "catalog"."event_identities" FROM anon, authenticated;

-- End of Drizzle-equivalent delta.

-- VELYQ is moving from a synthetic-demo-only foundation to real-data capability.
-- `catalog.events.synthetic` (@velyq/domain: DataOrigin, `true` = SYNTHETIC_DEMO,
-- `false` = LIVE) previously carried `CHECK (synthetic = true)`, forbidding any
-- non-synthetic row from existing at all. That boundary is gone, but the
-- invariant it protected has moved rather than disappeared: a LIVE row must be
-- traceable to real provider provenance via `catalog.event_identities`. That
-- cannot be a column CHECK (it must read a different table), so it is enforced
-- with a deferred constraint trigger that fires at COMMIT rather than at the
-- individual INSERT -- an event row and its event_identities row are written in
-- the same transaction, in that order (event_identities.event_id references
-- events.id), so a same-statement CHECK would always reject the very insert it
-- exists to allow. Deferring to commit time lets both rows exist before the
-- rule is evaluated.
ALTER TABLE "catalog"."events" DROP CONSTRAINT "events_phase_one_synthetic_check";

CREATE FUNCTION catalog.enforce_event_provenance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
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
$$;

REVOKE ALL ON FUNCTION catalog.enforce_event_provenance() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION catalog.enforce_event_provenance() TO postgres, service_role;

CREATE CONSTRAINT TRIGGER events_provenance_required
AFTER INSERT OR UPDATE OF synthetic ON catalog.events
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION catalog.enforce_event_provenance();
