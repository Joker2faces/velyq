import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  numeric,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { events, participants } from "./catalog.js";
import { eventMarketOutcomes, oddsObservations } from "./market.js";
import { jobs, sourceObservations } from "./operations.js";
import { intelligenceSchema } from "./schemas.js";

export const lineupObservations = intelligenceSchema.table(
  "lineup_observations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceObservationId: uuid("source_observation_id")
      .notNull()
      .references(() => sourceObservations.id, { onDelete: "restrict" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "restrict" }),
    teamParticipantId: uuid("team_participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "restrict" }),
    schemaVersion: text("schema_version").notNull(),
    status: text("status").notNull(),
    confidence: numeric("confidence", {
      precision: 8,
      scale: 7,
      mode: "string",
    }),
    players: jsonb("players")
      .notNull()
      .default(sql`'[]'::jsonb`),
    formation: text("formation"),
    providerObservedAt: timestamp("provider_observed_at", {
      withTimezone: true,
    }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    unique("lineup_observations_source_event_team_unique").on(
      table.sourceObservationId,
      table.eventId,
      table.teamParticipantId,
    ),
    index("lineup_observations_event_team_received_at_idx").on(
      table.eventId,
      table.teamParticipantId,
      table.receivedAt.desc(),
    ),
    index("lineup_observations_team_participant_id_idx").on(
      table.teamParticipantId,
    ),
    check(
      "lineup_observations_status_check",
      sql`${table.status} in ('EXPECTED', 'OFFICIAL', 'UNAVAILABLE')`,
    ),
    check(
      "lineup_observations_confidence_check",
      sql`${table.confidence} is null or (${table.confidence}::text not in ('NaN', 'Infinity', '-Infinity') and ${table.confidence} >= 0 and ${table.confidence} <= 1)`,
    ),
    check(
      "lineup_observations_players_array_check",
      sql`jsonb_typeof(${table.players}) = 'array'`,
    ),
  ],
);

export const dataQualityPolicyVersions = intelligenceSchema.table(
  "data_quality_policy_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    version: text("version").notNull(),
    validationStatus: text("validation_status").notNull(),
    definition: jsonb("definition").notNull(),
    effectiveFrom: timestamp("effective_from", {
      withTimezone: true,
    }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("data_quality_policy_versions_code_version_unique").on(
      table.code,
      table.version,
    ),
  ],
);

export const dataQualityAssessments = intelligenceSchema.table(
  "data_quality_assessments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    policyVersionId: uuid("policy_version_id")
      .notNull()
      .references(() => dataQualityPolicyVersions.id, { onDelete: "restrict" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "restrict" }),
    marketOutcomeId: uuid("market_outcome_id").references(
      () => eventMarketOutcomes.id,
      { onDelete: "restrict" },
    ),
    asOf: timestamp("as_of", { withTimezone: true }).notNull(),
    grade: text("grade").notNull(),
    numericScore: numeric("numeric_score", {
      precision: 8,
      scale: 4,
      mode: "string",
    }).notNull(),
    components: jsonb("components").notNull(),
    reasonCodes: text("reason_codes").array().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("data_quality_assessments_event_id_as_of_idx").on(
      table.eventId,
      table.asOf.desc(),
    ),
    index("data_quality_assessments_market_outcome_id_as_of_idx").on(
      table.marketOutcomeId,
      table.asOf.desc(),
    ),
    index("data_quality_assessments_policy_version_id_idx").on(
      table.policyVersionId,
    ),
    check(
      "data_quality_assessments_numeric_score_finite_check",
      sql`${table.numericScore}::text not in ('NaN', 'Infinity', '-Infinity')`,
    ),
  ],
);

export const modelDefinitions = intelligenceSchema.table(
  "model_definitions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    displayName: text("display_name").notNull(),
    description: text("description").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [unique("model_definitions_code_unique").on(table.code)],
);

export const modelVersions = intelligenceSchema.table(
  "model_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    modelDefinitionId: uuid("model_definition_id")
      .notNull()
      .references(() => modelDefinitions.id, { onDelete: "restrict" }),
    version: text("version").notNull(),
    maturityStatus: text("maturity_status").notNull(),
    validationStatus: text("validation_status").notNull(),
    featureContractVersion: text("feature_contract_version").notNull(),
    artifactReference: text("artifact_reference"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    retiredAt: timestamp("retired_at", { withTimezone: true }),
  },
  (table) => [
    unique("model_versions_definition_id_version_unique").on(
      table.modelDefinitionId,
      table.version,
    ),
    check(
      "model_versions_maturity_status_check",
      sql`${table.maturityStatus} in ('EXPERIMENTAL', 'BACKTESTED', 'VALIDATED', 'PRODUCTION', 'RETIRED')`,
    ),
  ],
);

export const calibrationVersions = intelligenceSchema.table(
  "calibration_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    modelVersionId: uuid("model_version_id")
      .notNull()
      .references(() => modelVersions.id, { onDelete: "restrict" }),
    version: text("version").notNull(),
    method: text("method").notNull(),
    parameters: jsonb("parameters").notNull(),
    validationStatus: text("validation_status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("calibration_versions_model_version_id_version_unique").on(
      table.modelVersionId,
      table.version,
    ),
  ],
);

export const predictionRuns = intelligenceSchema.table(
  "prediction_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    modelVersionId: uuid("model_version_id")
      .notNull()
      .references(() => modelVersions.id, { onDelete: "restrict" }),
    calibrationVersionId: uuid("calibration_version_id")
      .notNull()
      .references(() => calibrationVersions.id, { onDelete: "restrict" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "restrict" }),
    featureCutoff: timestamp("feature_cutoff", {
      withTimezone: true,
    }).notNull(),
    status: text("status").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    triggerJobId: uuid("trigger_job_id").references(() => jobs.id, {
      onDelete: "restrict",
    }),
  },
  (table) => [
    index("prediction_runs_event_id_feature_cutoff_idx").on(
      table.eventId,
      table.featureCutoff.desc(),
    ),
    index("prediction_runs_model_version_id_idx").on(table.modelVersionId),
    index("prediction_runs_calibration_version_id_idx").on(
      table.calibrationVersionId,
    ),
    index("prediction_runs_trigger_job_id_idx").on(table.triggerJobId),
    unique("prediction_runs_trigger_job_id_unique").on(table.triggerJobId),
  ],
);

export const predictions = intelligenceSchema.table(
  "predictions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    predictionRunId: uuid("prediction_run_id")
      .notNull()
      .references(() => predictionRuns.id, { onDelete: "restrict" }),
    eventMarketOutcomeId: uuid("event_market_outcome_id")
      .notNull()
      .references(() => eventMarketOutcomes.id, { onDelete: "restrict" }),
    dataQualityAssessmentId: uuid("data_quality_assessment_id")
      .notNull()
      .references(() => dataQualityAssessments.id, { onDelete: "restrict" }),
    marketPriceObservationId: uuid("market_price_observation_id").references(
      () => oddsObservations.id,
      { onDelete: "restrict" },
    ),
    decisionStatus: text("decision_status").notNull(),
    modelProbability: numeric("model_probability", {
      precision: 18,
      scale: 12,
      mode: "string",
    }),
    confidence: numeric("confidence", {
      precision: 18,
      scale: 12,
      mode: "string",
    }),
    fairOdds: numeric("fair_odds", {
      precision: 18,
      scale: 8,
      mode: "string",
    }),
    marketImpliedProbability: numeric("market_implied_probability", {
      precision: 18,
      scale: 12,
      mode: "string",
    }),
    edge: numeric("edge", { precision: 18, scale: 12, mode: "string" }),
    expectedValue: numeric("expected_value", {
      precision: 18,
      scale: 12,
      mode: "string",
    }),
    reasonCodes: text("reason_codes").array().notNull(),
    structuredReasons: jsonb("structured_reasons").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("predictions_run_id_outcome_id_unique").on(
      table.predictionRunId,
      table.eventMarketOutcomeId,
    ),
    index("predictions_outcome_id_created_at_idx").on(
      table.eventMarketOutcomeId,
      table.createdAt.desc(),
    ),
    index("predictions_decision_status_created_at_idx").on(
      table.decisionStatus,
      table.createdAt.desc(),
    ),
    index("predictions_data_quality_assessment_id_idx").on(
      table.dataQualityAssessmentId,
    ),
    index("predictions_market_price_observation_id_idx").on(
      table.marketPriceObservationId,
    ),
    check(
      "predictions_model_probability_check",
      sql`${table.modelProbability} is null or (${table.modelProbability}::text not in ('NaN', 'Infinity', '-Infinity') and ${table.modelProbability} >= 0 and ${table.modelProbability} <= 1)`,
    ),
    check(
      "predictions_confidence_check",
      sql`${table.confidence} is null or (${table.confidence}::text not in ('NaN', 'Infinity', '-Infinity') and ${table.confidence} >= 0 and ${table.confidence} <= 1)`,
    ),
    check(
      "predictions_fair_odds_check",
      sql`${table.fairOdds} is null or (${table.fairOdds}::text not in ('NaN', 'Infinity', '-Infinity') and ${table.fairOdds} > 1)`,
    ),
    check(
      "predictions_market_implied_probability_check",
      sql`${table.marketImpliedProbability} is null or (${table.marketImpliedProbability}::text not in ('NaN', 'Infinity', '-Infinity') and ${table.marketImpliedProbability} >= 0 and ${table.marketImpliedProbability} <= 1)`,
    ),
    check(
      "predictions_edge_finite_check",
      sql`${table.edge} is null or ${table.edge}::text not in ('NaN', 'Infinity', '-Infinity')`,
    ),
    check(
      "predictions_expected_value_finite_check",
      sql`${table.expectedValue} is null or ${table.expectedValue}::text not in ('NaN', 'Infinity', '-Infinity')`,
    ),
  ],
);

export const predictionInputs = intelligenceSchema.table(
  "prediction_inputs",
  {
    predictionId: uuid("prediction_id")
      .notNull()
      .references(() => predictions.id, { onDelete: "restrict" }),
    sourceObservationId: uuid("source_observation_id")
      .notNull()
      .references(() => sourceObservations.id, { onDelete: "restrict" }),
    inputRole: text("input_role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "prediction_inputs_pkey",
      columns: [table.predictionId, table.sourceObservationId, table.inputRole],
    }),
    index("prediction_inputs_source_observation_id_idx").on(
      table.sourceObservationId,
    ),
  ],
);

export const scoreDefinitionVersions = intelligenceSchema.table(
  "score_definition_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scoreType: text("score_type").notNull(),
    code: text("code").notNull(),
    version: text("version").notNull(),
    validationStatus: text("validation_status").notNull(),
    definition: jsonb("definition").notNull(),
    effectiveFrom: timestamp("effective_from", {
      withTimezone: true,
    }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("score_definition_versions_identity_unique").on(
      table.scoreType,
      table.code,
      table.version,
    ),
    check(
      "score_definition_versions_score_type_check",
      sql`${table.scoreType} in ('EDGE', 'RADAR')`,
    ),
    check(
      "score_definition_versions_validation_status_check",
      sql`${table.validationStatus} = 'DEVELOPMENT_HEURISTIC'`,
    ),
  ],
);

export const scoreResults = intelligenceSchema.table(
  "score_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scoreDefinitionVersionId: uuid("score_definition_version_id")
      .notNull()
      .references(() => scoreDefinitionVersions.id, { onDelete: "restrict" }),
    predictionId: uuid("prediction_id").references(() => predictions.id, {
      onDelete: "restrict",
    }),
    eventMarketOutcomeId: uuid("event_market_outcome_id")
      .notNull()
      .references(() => eventMarketOutcomes.id, { onDelete: "restrict" }),
    dataQualityAssessmentId: uuid("data_quality_assessment_id")
      .notNull()
      .references(() => dataQualityAssessments.id, { onDelete: "restrict" }),
    asOf: timestamp("as_of", { withTimezone: true }).notNull(),
    score: numeric("score", {
      precision: 8,
      scale: 4,
      mode: "string",
    }).notNull(),
    components: jsonb("components").notNull(),
    weights: jsonb("weights").notNull(),
    capsPenalties: jsonb("caps_penalties").notNull(),
    reasonCodes: text("reason_codes").array().notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("score_results_outcome_id_as_of_idx").on(
      table.eventMarketOutcomeId,
      table.asOf.desc(),
    ),
    index("score_results_definition_id_as_of_idx").on(
      table.scoreDefinitionVersionId,
      table.asOf.desc(),
    ),
    index("score_results_prediction_id_idx").on(table.predictionId),
    unique("score_results_idempotency_key_unique").on(table.idempotencyKey),
    index("score_results_data_quality_assessment_id_idx").on(
      table.dataQualityAssessmentId,
    ),
    check(
      "score_results_score_check",
      sql`${table.score}::text not in ('NaN', 'Infinity', '-Infinity') and ${table.score} >= 0 and ${table.score} <= 100`,
    ),
  ],
);

export const radarEvidence = intelligenceSchema.table(
  "radar_evidence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scoreResultId: uuid("score_result_id")
      .notNull()
      .references(() => scoreResults.id, { onDelete: "restrict" }),
    openingObservationId: uuid("opening_observation_id")
      .notNull()
      .references(() => oddsObservations.id, { onDelete: "restrict" }),
    currentObservationId: uuid("current_observation_id")
      .notNull()
      .references(() => oddsObservations.id, { onDelete: "restrict" }),
    supportingObservationIds: uuid("supporting_observation_ids")
      .array()
      .notNull(),
    bookmakersObserved: integer("bookmakers_observed").notNull(),
    bookmakersMoving: integer("bookmakers_moving").notNull(),
    movementWindowSeconds: integer("movement_window_seconds").notNull(),
    observableMetrics: jsonb("observable_metrics").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("radar_evidence_score_result_id_unique").on(table.scoreResultId),
    index("radar_evidence_opening_observation_id_idx").on(
      table.openingObservationId,
    ),
    index("radar_evidence_current_observation_id_idx").on(
      table.currentObservationId,
    ),
  ],
);
