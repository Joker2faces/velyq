CREATE SCHEMA "audit";
--> statement-breakpoint
CREATE SCHEMA "catalog";
--> statement-breakpoint
CREATE SCHEMA "intelligence";
--> statement-breakpoint
CREATE SCHEMA "market";
--> statement-breakpoint
CREATE SCHEMA "operations";
--> statement-breakpoint
CREATE SCHEMA "private";
--> statement-breakpoint
CREATE TABLE "audit"."admin_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text NOT NULL,
	"reason" text,
	"before_state" jsonb,
	"after_state" jsonb,
	"request_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog"."competitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sport_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name_key" text NOT NULL,
	"country_code" char(2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "competitions_sport_id_code_unique" UNIQUE("sport_id","code")
);
--> statement-breakpoint
CREATE TABLE "catalog"."event_participants" (
	"event_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_participants_pkey" PRIMARY KEY("event_id","role"),
	CONSTRAINT "event_participants_event_id_participant_id_unique" UNIQUE("event_id","participant_id"),
	CONSTRAINT "event_participants_role_check" CHECK ("catalog"."event_participants"."role" in ('HOME', 'AWAY'))
);
--> statement-breakpoint
CREATE TABLE "catalog"."events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sport_id" uuid NOT NULL,
	"competition_id" uuid NOT NULL,
	"season_label" text,
	"starts_at" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"synthetic" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_phase_one_synthetic_check" CHECK ("catalog"."events"."synthetic" = true)
);
--> statement-breakpoint
CREATE TABLE "catalog"."participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sport_id" uuid NOT NULL,
	"type" text NOT NULL,
	"code" text NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "participants_sport_id_type_code_unique" UNIQUE("sport_id","type","code"),
	CONSTRAINT "participants_type_check" CHECK ("catalog"."participants"."type" in ('TEAM', 'PLAYER'))
);
--> statement-breakpoint
CREATE TABLE "catalog"."sports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sports_code_unique" UNIQUE("code"),
	CONSTRAINT "sports_name_key_unique" UNIQUE("name_key")
);
--> statement-breakpoint
CREATE TABLE "intelligence"."calibration_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_version_id" uuid NOT NULL,
	"version" text NOT NULL,
	"method" text NOT NULL,
	"parameters" jsonb NOT NULL,
	"validation_status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calibration_versions_model_version_id_version_unique" UNIQUE("model_version_id","version")
);
--> statement-breakpoint
CREATE TABLE "intelligence"."data_quality_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"policy_version_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"market_outcome_id" uuid,
	"as_of" timestamp with time zone NOT NULL,
	"grade" text NOT NULL,
	"numeric_score" numeric(8, 4) NOT NULL,
	"components" jsonb NOT NULL,
	"reason_codes" text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "data_quality_assessments_numeric_score_finite_check" CHECK ("intelligence"."data_quality_assessments"."numeric_score"::text not in ('NaN', 'Infinity', '-Infinity'))
);
--> statement-breakpoint
CREATE TABLE "intelligence"."data_quality_policy_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"version" text NOT NULL,
	"validation_status" text NOT NULL,
	"definition" jsonb NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "data_quality_policy_versions_code_version_unique" UNIQUE("code","version")
);
--> statement-breakpoint
CREATE TABLE "intelligence"."lineup_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_observation_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"team_participant_id" uuid NOT NULL,
	"schema_version" text NOT NULL,
	"status" text NOT NULL,
	"confidence" numeric(8, 7),
	"players" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"formation" text,
	"provider_observed_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	CONSTRAINT "lineup_observations_source_event_team_unique" UNIQUE("source_observation_id","event_id","team_participant_id"),
	CONSTRAINT "lineup_observations_status_check" CHECK ("intelligence"."lineup_observations"."status" in ('EXPECTED', 'OFFICIAL', 'UNAVAILABLE')),
	CONSTRAINT "lineup_observations_confidence_check" CHECK ("intelligence"."lineup_observations"."confidence" is null or ("intelligence"."lineup_observations"."confidence"::text not in ('NaN', 'Infinity', '-Infinity') and "intelligence"."lineup_observations"."confidence" >= 0 and "intelligence"."lineup_observations"."confidence" <= 1)),
	CONSTRAINT "lineup_observations_players_array_check" CHECK (jsonb_typeof("intelligence"."lineup_observations"."players") = 'array')
);
--> statement-breakpoint
CREATE TABLE "intelligence"."model_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"display_name" text NOT NULL,
	"description" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "model_definitions_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "intelligence"."model_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_definition_id" uuid NOT NULL,
	"version" text NOT NULL,
	"maturity_status" text NOT NULL,
	"validation_status" text NOT NULL,
	"feature_contract_version" text NOT NULL,
	"artifact_reference" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retired_at" timestamp with time zone,
	CONSTRAINT "model_versions_definition_id_version_unique" UNIQUE("model_definition_id","version"),
	CONSTRAINT "model_versions_maturity_status_check" CHECK ("intelligence"."model_versions"."maturity_status" in ('EXPERIMENTAL', 'BACKTESTED', 'VALIDATED', 'PRODUCTION', 'RETIRED'))
);
--> statement-breakpoint
CREATE TABLE "intelligence"."prediction_inputs" (
	"prediction_id" uuid NOT NULL,
	"source_observation_id" uuid NOT NULL,
	"input_role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prediction_inputs_pkey" PRIMARY KEY("prediction_id","source_observation_id","input_role")
);
--> statement-breakpoint
CREATE TABLE "intelligence"."prediction_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_version_id" uuid NOT NULL,
	"calibration_version_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"feature_cutoff" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"trigger_job_id" uuid
);
--> statement-breakpoint
CREATE TABLE "intelligence"."predictions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prediction_run_id" uuid NOT NULL,
	"event_market_outcome_id" uuid NOT NULL,
	"data_quality_assessment_id" uuid NOT NULL,
	"market_price_observation_id" uuid,
	"decision_status" text NOT NULL,
	"model_probability" numeric(18, 12),
	"confidence" numeric(18, 12),
	"fair_odds" numeric(18, 8),
	"market_implied_probability" numeric(18, 12),
	"edge" numeric(18, 12),
	"expected_value" numeric(18, 12),
	"reason_codes" text[] NOT NULL,
	"structured_reasons" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "predictions_run_id_outcome_id_unique" UNIQUE("prediction_run_id","event_market_outcome_id"),
	CONSTRAINT "predictions_model_probability_check" CHECK ("intelligence"."predictions"."model_probability" is null or ("intelligence"."predictions"."model_probability"::text not in ('NaN', 'Infinity', '-Infinity') and "intelligence"."predictions"."model_probability" >= 0 and "intelligence"."predictions"."model_probability" <= 1)),
	CONSTRAINT "predictions_confidence_check" CHECK ("intelligence"."predictions"."confidence" is null or ("intelligence"."predictions"."confidence"::text not in ('NaN', 'Infinity', '-Infinity') and "intelligence"."predictions"."confidence" >= 0 and "intelligence"."predictions"."confidence" <= 1)),
	CONSTRAINT "predictions_fair_odds_check" CHECK ("intelligence"."predictions"."fair_odds" is null or ("intelligence"."predictions"."fair_odds"::text not in ('NaN', 'Infinity', '-Infinity') and "intelligence"."predictions"."fair_odds" > 1)),
	CONSTRAINT "predictions_market_implied_probability_check" CHECK ("intelligence"."predictions"."market_implied_probability" is null or ("intelligence"."predictions"."market_implied_probability"::text not in ('NaN', 'Infinity', '-Infinity') and "intelligence"."predictions"."market_implied_probability" >= 0 and "intelligence"."predictions"."market_implied_probability" <= 1)),
	CONSTRAINT "predictions_edge_finite_check" CHECK ("intelligence"."predictions"."edge" is null or "intelligence"."predictions"."edge"::text not in ('NaN', 'Infinity', '-Infinity')),
	CONSTRAINT "predictions_expected_value_finite_check" CHECK ("intelligence"."predictions"."expected_value" is null or "intelligence"."predictions"."expected_value"::text not in ('NaN', 'Infinity', '-Infinity'))
);
--> statement-breakpoint
CREATE TABLE "intelligence"."radar_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"score_result_id" uuid NOT NULL,
	"opening_observation_id" uuid NOT NULL,
	"current_observation_id" uuid NOT NULL,
	"supporting_observation_ids" uuid[] NOT NULL,
	"bookmakers_observed" integer NOT NULL,
	"bookmakers_moving" integer NOT NULL,
	"movement_window_seconds" integer NOT NULL,
	"observable_metrics" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "radar_evidence_score_result_id_unique" UNIQUE("score_result_id")
);
--> statement-breakpoint
CREATE TABLE "intelligence"."score_definition_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"score_type" text NOT NULL,
	"code" text NOT NULL,
	"version" text NOT NULL,
	"validation_status" text NOT NULL,
	"definition" jsonb NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "score_definition_versions_identity_unique" UNIQUE("score_type","code","version"),
	CONSTRAINT "score_definition_versions_score_type_check" CHECK ("intelligence"."score_definition_versions"."score_type" in ('EDGE', 'RADAR')),
	CONSTRAINT "score_definition_versions_validation_status_check" CHECK ("intelligence"."score_definition_versions"."validation_status" = 'DEVELOPMENT_HEURISTIC')
);
--> statement-breakpoint
CREATE TABLE "intelligence"."score_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"score_definition_version_id" uuid NOT NULL,
	"prediction_id" uuid,
	"event_market_outcome_id" uuid NOT NULL,
	"data_quality_assessment_id" uuid NOT NULL,
	"as_of" timestamp with time zone NOT NULL,
	"score" numeric(8, 4) NOT NULL,
	"components" jsonb NOT NULL,
	"weights" jsonb NOT NULL,
	"caps_penalties" jsonb NOT NULL,
	"reason_codes" text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "score_results_score_check" CHECK ("intelligence"."score_results"."score"::text not in ('NaN', 'Infinity', '-Infinity') and "intelligence"."score_results"."score" >= 0 and "intelligence"."score_results"."score" <= 100)
);
--> statement-breakpoint
CREATE TABLE "market"."bookmakers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"display_name" text NOT NULL,
	"synthetic" boolean NOT NULL,
	"market_classification" text DEFAULT 'UNCLASSIFIED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookmakers_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "market"."event_market_outcomes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_market_id" uuid NOT NULL,
	"outcome_definition_id" uuid NOT NULL,
	"canonical_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_market_outcomes_canonical_key_unique" UNIQUE("canonical_key"),
	CONSTRAINT "event_market_outcomes_market_outcome_unique" UNIQUE("event_market_id","outcome_definition_id")
);
--> statement-breakpoint
CREATE TABLE "market"."event_markets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"market_definition_id" uuid NOT NULL,
	"subject_participant_id" uuid,
	"line_value" numeric(12, 4),
	"canonical_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_markets_canonical_key_unique" UNIQUE("canonical_key"),
	CONSTRAINT "event_markets_line_value_finite_check" CHECK ("market"."event_markets"."line_value" is null or "market"."event_markets"."line_value"::text not in ('NaN', 'Infinity', '-Infinity'))
);
--> statement-breakpoint
CREATE TABLE "market"."market_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sport_id" uuid NOT NULL,
	"code" text NOT NULL,
	"family_code" text NOT NULL,
	"period_code" text NOT NULL,
	"structure" text NOT NULL,
	"subject_type" text NOT NULL,
	"line_required" boolean NOT NULL,
	"line_rules" jsonb NOT NULL,
	"settlement_rule_version" text NOT NULL,
	"label_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "market_definitions_sport_id_code_unique" UNIQUE("sport_id","code"),
	CONSTRAINT "market_definitions_structure_check" CHECK ("market"."market_definitions"."structure" in ('TWO_WAY', 'THREE_WAY', 'MULTI_OUTCOME')),
	CONSTRAINT "market_definitions_subject_type_check" CHECK ("market"."market_definitions"."subject_type" in ('EVENT', 'TEAM', 'PLAYER'))
);
--> statement-breakpoint
CREATE TABLE "market"."odds_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_observation_id" uuid NOT NULL,
	"event_market_outcome_id" uuid NOT NULL,
	"bookmaker_id" uuid NOT NULL,
	"decimal_odds" numeric(18, 8) NOT NULL,
	"provider_observed_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"normalized_at" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"is_synthetic" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "odds_observations_source_outcome_bookmaker_unique" UNIQUE("source_observation_id","event_market_outcome_id","bookmaker_id"),
	CONSTRAINT "odds_observations_decimal_odds_check" CHECK ("market"."odds_observations"."decimal_odds"::text not in ('NaN', 'Infinity', '-Infinity') and "market"."odds_observations"."decimal_odds" > 1),
	CONSTRAINT "odds_observations_status_check" CHECK ("market"."odds_observations"."status" in ('ACTIVE', 'SUSPENDED', 'REMOVED'))
);
--> statement-breakpoint
CREATE TABLE "market"."outcome_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"market_definition_id" uuid NOT NULL,
	"code" text NOT NULL,
	"label_key" text NOT NULL,
	"sort_order" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outcome_definitions_market_id_code_unique" UNIQUE("market_definition_id","code"),
	CONSTRAINT "outcome_definitions_market_id_id_unique" UNIQUE("market_definition_id","id")
);
--> statement-breakpoint
CREATE TABLE "market"."provider_market_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"provider_market_key" text NOT NULL,
	"provider_outcome_key" text NOT NULL,
	"market_definition_id" uuid NOT NULL,
	"outcome_definition_id" uuid NOT NULL,
	"mapping_version" text NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_to" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_market_mappings_identity_unique" UNIQUE("provider_id","provider_market_key","provider_outcome_key","mapping_version")
);
--> statement-breakpoint
CREATE TABLE "operations"."jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"contract_version" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer NOT NULL,
	"available_at" timestamp with time zone NOT NULL,
	"lease_expires_at" timestamp with time zone,
	"correlation_id" uuid NOT NULL,
	"last_error" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	CONSTRAINT "jobs_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "operations"."provider_policy_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"version" text NOT NULL,
	"policy" jsonb NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_to" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_policy_versions_provider_id_version_unique" UNIQUE("provider_id","version")
);
--> statement-breakpoint
CREATE TABLE "operations"."provider_sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"capability" text NOT NULL,
	"status" text NOT NULL,
	"replay_sequence" text,
	"fixture_path" text,
	"content_hash" text,
	"provider_schema_version" text NOT NULL,
	"normalization_version" text NOT NULL,
	"mapping_version" text NOT NULL,
	"policy_version_id" uuid NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"received_count" integer DEFAULT 0 NOT NULL,
	"accepted_count" integer DEFAULT 0 NOT NULL,
	"rejected_count" integer DEFAULT 0 NOT NULL,
	"error_summary" jsonb
);
--> statement-breakpoint
CREATE TABLE "operations"."providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"display_name" text NOT NULL,
	"is_synthetic" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "providers_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "operations"."source_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"sync_run_id" uuid NOT NULL,
	"observation_type" text NOT NULL,
	"provider_external_id" text NOT NULL,
	"provider_observed_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"normalized_at" timestamp with time zone NOT NULL,
	"normalization_version" text NOT NULL,
	"mapping_version" text NOT NULL,
	"content_hash" text NOT NULL,
	CONSTRAINT "source_observations_provider_type_hash_unique" UNIQUE("provider_id","observation_type","content_hash")
);
--> statement-breakpoint
CREATE TABLE "private"."permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "permissions_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "private"."role_permissions" (
	"role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_permissions_pkey" PRIMARY KEY("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "private"."roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "private"."user_roles" (
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"granted_by" uuid NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_roles_pkey" PRIMARY KEY("user_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"display_name" text,
	"locale" text DEFAULT 'en' NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit"."admin_audit_events" ADD CONSTRAINT "admin_audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."competitions" ADD CONSTRAINT "competitions_sport_id_sports_id_fk" FOREIGN KEY ("sport_id") REFERENCES "catalog"."sports"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."event_participants" ADD CONSTRAINT "event_participants_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "catalog"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."event_participants" ADD CONSTRAINT "event_participants_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "catalog"."participants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."events" ADD CONSTRAINT "events_sport_id_sports_id_fk" FOREIGN KEY ("sport_id") REFERENCES "catalog"."sports"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."events" ADD CONSTRAINT "events_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "catalog"."competitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."participants" ADD CONSTRAINT "participants_sport_id_sports_id_fk" FOREIGN KEY ("sport_id") REFERENCES "catalog"."sports"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intelligence"."calibration_versions" ADD CONSTRAINT "calibration_versions_model_version_id_model_versions_id_fk" FOREIGN KEY ("model_version_id") REFERENCES "intelligence"."model_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intelligence"."data_quality_assessments" ADD CONSTRAINT "data_quality_assessments_policy_version_id_data_quality_policy_versions_id_fk" FOREIGN KEY ("policy_version_id") REFERENCES "intelligence"."data_quality_policy_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intelligence"."data_quality_assessments" ADD CONSTRAINT "data_quality_assessments_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "catalog"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intelligence"."data_quality_assessments" ADD CONSTRAINT "data_quality_assessments_market_outcome_id_event_market_outcomes_id_fk" FOREIGN KEY ("market_outcome_id") REFERENCES "market"."event_market_outcomes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intelligence"."lineup_observations" ADD CONSTRAINT "lineup_observations_source_observation_id_source_observations_id_fk" FOREIGN KEY ("source_observation_id") REFERENCES "operations"."source_observations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intelligence"."lineup_observations" ADD CONSTRAINT "lineup_observations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "catalog"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intelligence"."lineup_observations" ADD CONSTRAINT "lineup_observations_team_participant_id_participants_id_fk" FOREIGN KEY ("team_participant_id") REFERENCES "catalog"."participants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intelligence"."model_versions" ADD CONSTRAINT "model_versions_model_definition_id_model_definitions_id_fk" FOREIGN KEY ("model_definition_id") REFERENCES "intelligence"."model_definitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intelligence"."prediction_inputs" ADD CONSTRAINT "prediction_inputs_prediction_id_predictions_id_fk" FOREIGN KEY ("prediction_id") REFERENCES "intelligence"."predictions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intelligence"."prediction_inputs" ADD CONSTRAINT "prediction_inputs_source_observation_id_source_observations_id_fk" FOREIGN KEY ("source_observation_id") REFERENCES "operations"."source_observations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intelligence"."prediction_runs" ADD CONSTRAINT "prediction_runs_model_version_id_model_versions_id_fk" FOREIGN KEY ("model_version_id") REFERENCES "intelligence"."model_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intelligence"."prediction_runs" ADD CONSTRAINT "prediction_runs_calibration_version_id_calibration_versions_id_fk" FOREIGN KEY ("calibration_version_id") REFERENCES "intelligence"."calibration_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intelligence"."prediction_runs" ADD CONSTRAINT "prediction_runs_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "catalog"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intelligence"."prediction_runs" ADD CONSTRAINT "prediction_runs_trigger_job_id_jobs_id_fk" FOREIGN KEY ("trigger_job_id") REFERENCES "operations"."jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intelligence"."predictions" ADD CONSTRAINT "predictions_prediction_run_id_prediction_runs_id_fk" FOREIGN KEY ("prediction_run_id") REFERENCES "intelligence"."prediction_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intelligence"."predictions" ADD CONSTRAINT "predictions_event_market_outcome_id_event_market_outcomes_id_fk" FOREIGN KEY ("event_market_outcome_id") REFERENCES "market"."event_market_outcomes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intelligence"."predictions" ADD CONSTRAINT "predictions_data_quality_assessment_id_data_quality_assessments_id_fk" FOREIGN KEY ("data_quality_assessment_id") REFERENCES "intelligence"."data_quality_assessments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intelligence"."predictions" ADD CONSTRAINT "predictions_market_price_observation_id_odds_observations_id_fk" FOREIGN KEY ("market_price_observation_id") REFERENCES "market"."odds_observations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intelligence"."radar_evidence" ADD CONSTRAINT "radar_evidence_score_result_id_score_results_id_fk" FOREIGN KEY ("score_result_id") REFERENCES "intelligence"."score_results"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intelligence"."radar_evidence" ADD CONSTRAINT "radar_evidence_opening_observation_id_odds_observations_id_fk" FOREIGN KEY ("opening_observation_id") REFERENCES "market"."odds_observations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intelligence"."radar_evidence" ADD CONSTRAINT "radar_evidence_current_observation_id_odds_observations_id_fk" FOREIGN KEY ("current_observation_id") REFERENCES "market"."odds_observations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intelligence"."score_results" ADD CONSTRAINT "score_results_score_definition_version_id_score_definition_versions_id_fk" FOREIGN KEY ("score_definition_version_id") REFERENCES "intelligence"."score_definition_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intelligence"."score_results" ADD CONSTRAINT "score_results_prediction_id_predictions_id_fk" FOREIGN KEY ("prediction_id") REFERENCES "intelligence"."predictions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intelligence"."score_results" ADD CONSTRAINT "score_results_event_market_outcome_id_event_market_outcomes_id_fk" FOREIGN KEY ("event_market_outcome_id") REFERENCES "market"."event_market_outcomes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intelligence"."score_results" ADD CONSTRAINT "score_results_data_quality_assessment_id_data_quality_assessments_id_fk" FOREIGN KEY ("data_quality_assessment_id") REFERENCES "intelligence"."data_quality_assessments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market"."event_market_outcomes" ADD CONSTRAINT "event_market_outcomes_event_market_id_event_markets_id_fk" FOREIGN KEY ("event_market_id") REFERENCES "market"."event_markets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market"."event_market_outcomes" ADD CONSTRAINT "event_market_outcomes_outcome_definition_id_outcome_definitions_id_fk" FOREIGN KEY ("outcome_definition_id") REFERENCES "market"."outcome_definitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market"."event_markets" ADD CONSTRAINT "event_markets_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "catalog"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market"."event_markets" ADD CONSTRAINT "event_markets_market_definition_id_market_definitions_id_fk" FOREIGN KEY ("market_definition_id") REFERENCES "market"."market_definitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market"."event_markets" ADD CONSTRAINT "event_markets_subject_participant_id_participants_id_fk" FOREIGN KEY ("subject_participant_id") REFERENCES "catalog"."participants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market"."market_definitions" ADD CONSTRAINT "market_definitions_sport_id_sports_id_fk" FOREIGN KEY ("sport_id") REFERENCES "catalog"."sports"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market"."odds_observations" ADD CONSTRAINT "odds_observations_source_observation_id_source_observations_id_fk" FOREIGN KEY ("source_observation_id") REFERENCES "operations"."source_observations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market"."odds_observations" ADD CONSTRAINT "odds_observations_event_market_outcome_id_event_market_outcomes_id_fk" FOREIGN KEY ("event_market_outcome_id") REFERENCES "market"."event_market_outcomes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market"."odds_observations" ADD CONSTRAINT "odds_observations_bookmaker_id_bookmakers_id_fk" FOREIGN KEY ("bookmaker_id") REFERENCES "market"."bookmakers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market"."outcome_definitions" ADD CONSTRAINT "outcome_definitions_market_definition_id_market_definitions_id_fk" FOREIGN KEY ("market_definition_id") REFERENCES "market"."market_definitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market"."provider_market_mappings" ADD CONSTRAINT "provider_market_mappings_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "operations"."providers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market"."provider_market_mappings" ADD CONSTRAINT "provider_market_mappings_definition_outcome_fk" FOREIGN KEY ("market_definition_id","outcome_definition_id") REFERENCES "market"."outcome_definitions"("market_definition_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations"."provider_policy_versions" ADD CONSTRAINT "provider_policy_versions_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "operations"."providers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations"."provider_sync_runs" ADD CONSTRAINT "provider_sync_runs_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "operations"."providers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations"."provider_sync_runs" ADD CONSTRAINT "provider_sync_runs_policy_version_id_provider_policy_versions_id_fk" FOREIGN KEY ("policy_version_id") REFERENCES "operations"."provider_policy_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations"."source_observations" ADD CONSTRAINT "source_observations_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "operations"."providers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations"."source_observations" ADD CONSTRAINT "source_observations_sync_run_id_provider_sync_runs_id_fk" FOREIGN KEY ("sync_run_id") REFERENCES "operations"."provider_sync_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private"."role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "private"."roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private"."role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "private"."permissions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private"."user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private"."user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "private"."roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private"."user_roles" ADD CONSTRAINT "user_roles_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "auth"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_audit_events_actor_occurred_at_idx" ON "audit"."admin_audit_events" USING btree ("actor_user_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "admin_audit_events_resource_occurred_at_idx" ON "audit"."admin_audit_events" USING btree ("resource_type","resource_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "admin_audit_events_request_id_idx" ON "audit"."admin_audit_events" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "event_participants_participant_id_idx" ON "catalog"."event_participants" USING btree ("participant_id");--> statement-breakpoint
CREATE INDEX "events_starts_at_status_idx" ON "catalog"."events" USING btree ("starts_at","status");--> statement-breakpoint
CREATE INDEX "events_competition_id_starts_at_idx" ON "catalog"."events" USING btree ("competition_id","starts_at");--> statement-breakpoint
CREATE INDEX "events_sport_id_idx" ON "catalog"."events" USING btree ("sport_id");--> statement-breakpoint
CREATE INDEX "data_quality_assessments_event_id_as_of_idx" ON "intelligence"."data_quality_assessments" USING btree ("event_id","as_of" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "data_quality_assessments_market_outcome_id_as_of_idx" ON "intelligence"."data_quality_assessments" USING btree ("market_outcome_id","as_of" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "data_quality_assessments_policy_version_id_idx" ON "intelligence"."data_quality_assessments" USING btree ("policy_version_id");--> statement-breakpoint
CREATE INDEX "lineup_observations_event_team_received_at_idx" ON "intelligence"."lineup_observations" USING btree ("event_id","team_participant_id","received_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "lineup_observations_team_participant_id_idx" ON "intelligence"."lineup_observations" USING btree ("team_participant_id");--> statement-breakpoint
CREATE INDEX "prediction_inputs_source_observation_id_idx" ON "intelligence"."prediction_inputs" USING btree ("source_observation_id");--> statement-breakpoint
CREATE INDEX "prediction_runs_event_id_feature_cutoff_idx" ON "intelligence"."prediction_runs" USING btree ("event_id","feature_cutoff" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "prediction_runs_model_version_id_idx" ON "intelligence"."prediction_runs" USING btree ("model_version_id");--> statement-breakpoint
CREATE INDEX "prediction_runs_calibration_version_id_idx" ON "intelligence"."prediction_runs" USING btree ("calibration_version_id");--> statement-breakpoint
CREATE INDEX "prediction_runs_trigger_job_id_idx" ON "intelligence"."prediction_runs" USING btree ("trigger_job_id");--> statement-breakpoint
CREATE INDEX "predictions_outcome_id_created_at_idx" ON "intelligence"."predictions" USING btree ("event_market_outcome_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "predictions_decision_status_created_at_idx" ON "intelligence"."predictions" USING btree ("decision_status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "predictions_data_quality_assessment_id_idx" ON "intelligence"."predictions" USING btree ("data_quality_assessment_id");--> statement-breakpoint
CREATE INDEX "predictions_market_price_observation_id_idx" ON "intelligence"."predictions" USING btree ("market_price_observation_id");--> statement-breakpoint
CREATE INDEX "radar_evidence_opening_observation_id_idx" ON "intelligence"."radar_evidence" USING btree ("opening_observation_id");--> statement-breakpoint
CREATE INDEX "radar_evidence_current_observation_id_idx" ON "intelligence"."radar_evidence" USING btree ("current_observation_id");--> statement-breakpoint
CREATE INDEX "score_results_outcome_id_as_of_idx" ON "intelligence"."score_results" USING btree ("event_market_outcome_id","as_of" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "score_results_definition_id_as_of_idx" ON "intelligence"."score_results" USING btree ("score_definition_version_id","as_of" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "score_results_prediction_id_idx" ON "intelligence"."score_results" USING btree ("prediction_id");--> statement-breakpoint
CREATE INDEX "score_results_data_quality_assessment_id_idx" ON "intelligence"."score_results" USING btree ("data_quality_assessment_id");--> statement-breakpoint
CREATE INDEX "event_market_outcomes_outcome_definition_id_idx" ON "market"."event_market_outcomes" USING btree ("outcome_definition_id");--> statement-breakpoint
CREATE INDEX "event_markets_event_id_market_definition_id_idx" ON "market"."event_markets" USING btree ("event_id","market_definition_id");--> statement-breakpoint
CREATE INDEX "event_markets_market_definition_id_idx" ON "market"."event_markets" USING btree ("market_definition_id");--> statement-breakpoint
CREATE INDEX "event_markets_subject_participant_id_idx" ON "market"."event_markets" USING btree ("subject_participant_id");--> statement-breakpoint
CREATE INDEX "odds_observations_outcome_bookmaker_observed_at_idx" ON "market"."odds_observations" USING btree ("event_market_outcome_id","bookmaker_id","provider_observed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "odds_observations_bookmaker_observed_at_idx" ON "market"."odds_observations" USING btree ("bookmaker_id","provider_observed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "odds_observations_received_at_idx" ON "market"."odds_observations" USING btree ("received_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "provider_market_mappings_market_definition_id_idx" ON "market"."provider_market_mappings" USING btree ("market_definition_id");--> statement-breakpoint
CREATE INDEX "provider_market_mappings_outcome_definition_id_idx" ON "market"."provider_market_mappings" USING btree ("outcome_definition_id");--> statement-breakpoint
CREATE INDEX "jobs_status_available_at_idx" ON "operations"."jobs" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "jobs_lease_expires_at_idx" ON "operations"."jobs" USING btree ("lease_expires_at");--> statement-breakpoint
CREATE INDEX "jobs_correlation_id_idx" ON "operations"."jobs" USING btree ("correlation_id");--> statement-breakpoint
CREATE INDEX "provider_policy_versions_provider_id_effective_from_idx" ON "operations"."provider_policy_versions" USING btree ("provider_id","effective_from" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "provider_sync_runs_provider_id_started_at_idx" ON "operations"."provider_sync_runs" USING btree ("provider_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "provider_sync_runs_status_started_at_idx" ON "operations"."provider_sync_runs" USING btree ("status","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "provider_sync_runs_policy_version_id_idx" ON "operations"."provider_sync_runs" USING btree ("policy_version_id");--> statement-breakpoint
CREATE INDEX "source_observations_sync_run_id_idx" ON "operations"."source_observations" USING btree ("sync_run_id");--> statement-breakpoint
CREATE INDEX "source_observations_provider_id_observed_at_idx" ON "operations"."source_observations" USING btree ("provider_id","provider_observed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "role_permissions_permission_id_idx" ON "private"."role_permissions" USING btree ("permission_id");--> statement-breakpoint
CREATE INDEX "user_roles_role_id_user_id_idx" ON "private"."user_roles" USING btree ("role_id","user_id");--> statement-breakpoint
CREATE INDEX "user_roles_granted_by_idx" ON "private"."user_roles" USING btree ("granted_by");