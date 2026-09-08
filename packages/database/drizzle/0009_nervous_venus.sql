CREATE TABLE "catalog"."event_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"provider_id" uuid NOT NULL,
	"provider_fixture_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_identities_provider_identity_unique" UNIQUE("provider_id","provider_fixture_id"),
	CONSTRAINT "event_identities_event_provider_unique" UNIQUE("event_id","provider_id")
);
--> statement-breakpoint
ALTER TABLE "catalog"."event_identities" ADD CONSTRAINT "event_identities_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "catalog"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."event_identities" ADD CONSTRAINT "event_identities_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "operations"."providers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_identities_event_id_idx" ON "catalog"."event_identities" USING btree ("event_id");