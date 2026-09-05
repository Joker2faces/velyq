ALTER TABLE "intelligence"."score_results" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
UPDATE "intelligence"."score_results" SET "idempotency_key" = 'legacy:' || "id"::text WHERE "idempotency_key" IS NULL;--> statement-breakpoint
ALTER TABLE "intelligence"."score_results" ALTER COLUMN "idempotency_key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "intelligence"."prediction_runs" ADD CONSTRAINT "prediction_runs_trigger_job_id_unique" UNIQUE("trigger_job_id");--> statement-breakpoint
ALTER TABLE "intelligence"."score_results" ADD CONSTRAINT "score_results_idempotency_key_unique" UNIQUE("idempotency_key");
