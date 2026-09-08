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
--> statement-breakpoint
ALTER TABLE "catalog"."competition_identities" ADD CONSTRAINT "competition_identities_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "catalog"."competitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."competition_identities" ADD CONSTRAINT "competition_identities_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "operations"."providers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "competition_identities_competition_id_idx" ON "catalog"."competition_identities" USING btree ("competition_id");