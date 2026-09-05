ALTER TABLE "market"."event_market_outcomes" ADD COLUMN "market_definition_id" uuid;--> statement-breakpoint
UPDATE "market"."event_market_outcomes" AS outcome
SET "market_definition_id" = event_market."market_definition_id"
FROM "market"."event_markets" AS event_market
WHERE outcome."event_market_id" = event_market."id"
  AND outcome."market_definition_id" IS NULL;--> statement-breakpoint
ALTER TABLE "market"."event_market_outcomes" ALTER COLUMN "market_definition_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "operations"."jobs" ADD COLUMN "causation_id" uuid;--> statement-breakpoint
UPDATE "operations"."jobs"
SET "causation_id" = "correlation_id"
WHERE "causation_id" IS NULL;--> statement-breakpoint
ALTER TABLE "operations"."jobs" ALTER COLUMN "causation_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "market"."event_markets" ADD CONSTRAINT "event_markets_id_market_definition_id_unique" UNIQUE("id","market_definition_id");--> statement-breakpoint
ALTER TABLE "market"."event_market_outcomes" DROP CONSTRAINT "event_market_outcomes_event_market_id_event_markets_id_fk";--> statement-breakpoint
ALTER TABLE "market"."event_market_outcomes" DROP CONSTRAINT "event_market_outcomes_outcome_definition_id_outcome_definitions_id_fk";--> statement-breakpoint
ALTER TABLE "market"."event_market_outcomes" ADD CONSTRAINT "event_market_outcomes_event_market_definition_fk" FOREIGN KEY ("event_market_id","market_definition_id") REFERENCES "market"."event_markets"("id","market_definition_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market"."event_market_outcomes" ADD CONSTRAINT "event_market_outcomes_definition_outcome_fk" FOREIGN KEY ("market_definition_id","outcome_definition_id") REFERENCES "market"."outcome_definitions"("market_definition_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_market_outcomes_definition_outcome_idx" ON "market"."event_market_outcomes" USING btree ("market_definition_id","outcome_definition_id");--> statement-breakpoint
ALTER TABLE "operations"."jobs" ADD CONSTRAINT "jobs_attempt_count_nonnegative_check" CHECK ("operations"."jobs"."attempt_count" >= 0);--> statement-breakpoint
ALTER TABLE "operations"."jobs" ADD CONSTRAINT "jobs_max_attempts_positive_check" CHECK ("operations"."jobs"."max_attempts" > 0);--> statement-breakpoint
ALTER TABLE "operations"."jobs" ADD CONSTRAINT "jobs_attempt_count_within_max_check" CHECK ("operations"."jobs"."attempt_count" <= "operations"."jobs"."max_attempts");--> statement-breakpoint
ALTER TABLE "operations"."jobs" ADD CONSTRAINT "jobs_status_check" CHECK ("operations"."jobs"."status" in ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED'));--> statement-breakpoint
ALTER TABLE "operations"."jobs" ADD CONSTRAINT "jobs_state_check" CHECK ((
  ("operations"."jobs"."status" = 'PENDING' and "operations"."jobs"."lease_expires_at" is null and "operations"."jobs"."completed_at" is null)
  or ("operations"."jobs"."status" = 'RUNNING' and "operations"."jobs"."lease_expires_at" is not null and "operations"."jobs"."started_at" is not null and "operations"."jobs"."completed_at" is null)
  or ("operations"."jobs"."status" = 'COMPLETED' and "operations"."jobs"."lease_expires_at" is null and "operations"."jobs"."started_at" is not null and "operations"."jobs"."completed_at" is not null and "operations"."jobs"."last_error" is null)
  or ("operations"."jobs"."status" = 'FAILED' and "operations"."jobs"."lease_expires_at" is null and "operations"."jobs"."started_at" is not null and "operations"."jobs"."completed_at" is not null and "operations"."jobs"."last_error" is not null)
));
