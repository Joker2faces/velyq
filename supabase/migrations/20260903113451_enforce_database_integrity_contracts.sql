-- Generated Drizzle schema delta. Existing rows are backfilled before NOT NULL.
ALTER TABLE "market"."event_market_outcomes" ADD COLUMN "market_definition_id" uuid;
UPDATE "market"."event_market_outcomes" AS outcome
SET "market_definition_id" = event_market."market_definition_id"
FROM "market"."event_markets" AS event_market
WHERE outcome."event_market_id" = event_market."id"
  AND outcome."market_definition_id" IS NULL;
ALTER TABLE "market"."event_market_outcomes" ALTER COLUMN "market_definition_id" SET NOT NULL;

ALTER TABLE "operations"."jobs" ADD COLUMN "causation_id" uuid;
UPDATE "operations"."jobs"
SET "causation_id" = "correlation_id"
WHERE "causation_id" IS NULL;
ALTER TABLE "operations"."jobs" ALTER COLUMN "causation_id" SET NOT NULL;

ALTER TABLE "market"."event_markets" ADD CONSTRAINT "event_markets_id_market_definition_id_unique" UNIQUE("id","market_definition_id");
ALTER TABLE "market"."event_market_outcomes" DROP CONSTRAINT "event_market_outcomes_event_market_id_event_markets_id_fk";
ALTER TABLE "market"."event_market_outcomes" DROP CONSTRAINT "event_market_outcomes_outcome_definition_id_outcome_definitions_id_fk";
ALTER TABLE "market"."event_market_outcomes" ADD CONSTRAINT "event_market_outcomes_event_market_definition_fk" FOREIGN KEY ("event_market_id","market_definition_id") REFERENCES "market"."event_markets"("id","market_definition_id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "market"."event_market_outcomes" ADD CONSTRAINT "event_market_outcomes_definition_outcome_fk" FOREIGN KEY ("market_definition_id","outcome_definition_id") REFERENCES "market"."outcome_definitions"("market_definition_id","id") ON DELETE restrict ON UPDATE no action;
CREATE INDEX "event_market_outcomes_definition_outcome_idx" ON "market"."event_market_outcomes" USING btree ("market_definition_id","outcome_definition_id");

ALTER TABLE "operations"."jobs" ADD CONSTRAINT "jobs_attempt_count_nonnegative_check" CHECK ("operations"."jobs"."attempt_count" >= 0);
ALTER TABLE "operations"."jobs" ADD CONSTRAINT "jobs_max_attempts_positive_check" CHECK ("operations"."jobs"."max_attempts" > 0);
ALTER TABLE "operations"."jobs" ADD CONSTRAINT "jobs_attempt_count_within_max_check" CHECK ("operations"."jobs"."attempt_count" <= "operations"."jobs"."max_attempts");
ALTER TABLE "operations"."jobs" ADD CONSTRAINT "jobs_status_check" CHECK ("operations"."jobs"."status" in ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED'));
ALTER TABLE "operations"."jobs" ADD CONSTRAINT "jobs_state_check" CHECK ((
  ("operations"."jobs"."status" = 'PENDING' and "operations"."jobs"."lease_expires_at" is null and "operations"."jobs"."completed_at" is null)
  or ("operations"."jobs"."status" = 'RUNNING' and "operations"."jobs"."lease_expires_at" is not null and "operations"."jobs"."started_at" is not null and "operations"."jobs"."completed_at" is null)
  or ("operations"."jobs"."status" = 'COMPLETED' and "operations"."jobs"."lease_expires_at" is null and "operations"."jobs"."started_at" is not null and "operations"."jobs"."completed_at" is not null and "operations"."jobs"."last_error" is null)
  or ("operations"."jobs"."status" = 'FAILED' and "operations"."jobs"."lease_expires_at" is null and "operations"."jobs"."started_at" is not null and "operations"."jobs"."completed_at" is not null and "operations"."jobs"."last_error" is not null)
));

-- Parent-side semantic updates would invalidate already materialized children.
DROP TRIGGER enforce_event_market_identity ON market.event_markets;
CREATE TRIGGER enforce_event_market_identity
BEFORE INSERT ON market.event_markets
FOR EACH ROW
EXECUTE FUNCTION private.enforce_event_market_identity();

DROP TRIGGER enforce_event_market_outcome_identity ON market.event_market_outcomes;
CREATE TRIGGER enforce_event_market_outcome_identity
BEFORE INSERT ON market.event_market_outcomes
FOR EACH ROW
EXECUTE FUNCTION private.enforce_event_market_outcome_identity();

CREATE FUNCTION private.reject_semantic_identity_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '55000',
    MESSAGE = format('%I.%I semantic identity is immutable', TG_TABLE_SCHEMA, TG_TABLE_NAME);
END;
$$;

REVOKE ALL ON FUNCTION private.reject_semantic_identity_mutation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.reject_semantic_identity_mutation() TO postgres, service_role;

CREATE TRIGGER protect_market_definitions_semantic_identity
BEFORE UPDATE OF id, sport_id, code, family_code, period_code, structure, subject_type, line_required, line_rules, settlement_rule_version
ON market.market_definitions
FOR EACH ROW EXECUTE FUNCTION private.reject_semantic_identity_mutation();

CREATE TRIGGER protect_outcome_definitions_semantic_identity
BEFORE UPDATE OF id, market_definition_id, code
ON market.outcome_definitions
FOR EACH ROW EXECUTE FUNCTION private.reject_semantic_identity_mutation();

CREATE TRIGGER protect_event_markets_semantic_identity
BEFORE UPDATE OF id, event_id, market_definition_id, subject_participant_id, line_value, canonical_key
ON market.event_markets
FOR EACH ROW EXECUTE FUNCTION private.reject_semantic_identity_mutation();

CREATE TRIGGER protect_event_market_outcomes_semantic_identity
BEFORE UPDATE OF id, event_market_id, market_definition_id, outcome_definition_id, canonical_key
ON market.event_market_outcomes
FOR EACH ROW EXECUTE FUNCTION private.reject_semantic_identity_mutation();
