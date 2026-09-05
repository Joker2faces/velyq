ALTER TABLE "operations"."jobs" DROP CONSTRAINT "jobs_state_check";--> statement-breakpoint
ALTER TABLE "operations"."jobs" ADD COLUMN "lease_owner" text;--> statement-breakpoint
ALTER TABLE "operations"."jobs" ADD CONSTRAINT "jobs_state_check" CHECK ((
        ("operations"."jobs"."status" = 'PENDING' and "operations"."jobs"."lease_expires_at" is null and "operations"."jobs"."lease_owner" is null and "operations"."jobs"."completed_at" is null)
        or ("operations"."jobs"."status" = 'RUNNING' and "operations"."jobs"."lease_expires_at" is not null and "operations"."jobs"."lease_owner" is not null and "operations"."jobs"."started_at" is not null and "operations"."jobs"."completed_at" is null)
        or ("operations"."jobs"."status" = 'COMPLETED' and "operations"."jobs"."lease_expires_at" is null and "operations"."jobs"."lease_owner" is null and "operations"."jobs"."started_at" is not null and "operations"."jobs"."completed_at" is not null and "operations"."jobs"."last_error" is null)
        or ("operations"."jobs"."status" = 'FAILED' and "operations"."jobs"."lease_expires_at" is null and "operations"."jobs"."lease_owner" is null and "operations"."jobs"."started_at" is not null and "operations"."jobs"."completed_at" is not null and "operations"."jobs"."last_error" is not null)
      ));