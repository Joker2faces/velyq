-- The cross-table provenance invariant this constraint protected (a LIVE row
-- must have a catalog.event_identities row) is enforced by a deferred
-- constraint trigger, not expressible here since drizzle-kit does not model
-- triggers. See supabase/migrations/20260908090000_provider_identity_and_live_data.sql.
ALTER TABLE "catalog"."events" DROP CONSTRAINT "events_phase_one_synthetic_check";