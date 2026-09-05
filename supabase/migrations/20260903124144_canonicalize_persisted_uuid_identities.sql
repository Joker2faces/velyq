ALTER TABLE "market"."event_markets" ADD CONSTRAINT "event_markets_natural_identity_unique" UNIQUE NULLS NOT DISTINCT("event_id","market_definition_id","subject_participant_id","line_value");
