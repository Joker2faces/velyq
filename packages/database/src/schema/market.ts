import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  jsonb,
  numeric,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { events, participants, sports } from "./catalog.js";
import { providers, sourceObservations } from "./operations.js";
import { marketSchema } from "./schemas.js";

export const marketDefinitions = marketSchema.table(
  "market_definitions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sportId: uuid("sport_id")
      .notNull()
      .references(() => sports.id, { onDelete: "restrict" }),
    code: text("code").notNull(),
    familyCode: text("family_code").notNull(),
    periodCode: text("period_code").notNull(),
    structure: text("structure").notNull(),
    subjectType: text("subject_type").notNull(),
    lineRequired: boolean("line_required").notNull(),
    lineRules: jsonb("line_rules").notNull(),
    settlementRuleVersion: text("settlement_rule_version").notNull(),
    labelKey: text("label_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("market_definitions_sport_id_code_unique").on(
      table.sportId,
      table.code,
    ),
    check(
      "market_definitions_structure_check",
      sql`${table.structure} in ('TWO_WAY', 'THREE_WAY', 'MULTI_OUTCOME')`,
    ),
    check(
      "market_definitions_subject_type_check",
      sql`${table.subjectType} in ('EVENT', 'TEAM', 'PLAYER')`,
    ),
  ],
);

export const outcomeDefinitions = marketSchema.table(
  "outcome_definitions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    marketDefinitionId: uuid("market_definition_id")
      .notNull()
      .references(() => marketDefinitions.id, { onDelete: "restrict" }),
    code: text("code").notNull(),
    labelKey: text("label_key").notNull(),
    sortOrder: smallint("sort_order").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("outcome_definitions_market_id_code_unique").on(
      table.marketDefinitionId,
      table.code,
    ),
    unique("outcome_definitions_market_id_id_unique").on(
      table.marketDefinitionId,
      table.id,
    ),
  ],
);

export const providerMarketMappings = marketSchema.table(
  "provider_market_mappings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "restrict" }),
    providerMarketKey: text("provider_market_key").notNull(),
    providerOutcomeKey: text("provider_outcome_key").notNull(),
    marketDefinitionId: uuid("market_definition_id").notNull(),
    outcomeDefinitionId: uuid("outcome_definition_id").notNull(),
    mappingVersion: text("mapping_version").notNull(),
    effectiveFrom: timestamp("effective_from", {
      withTimezone: true,
    }).notNull(),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("provider_market_mappings_identity_unique").on(
      table.providerId,
      table.providerMarketKey,
      table.providerOutcomeKey,
      table.mappingVersion,
    ),
    foreignKey({
      name: "provider_market_mappings_definition_outcome_fk",
      columns: [table.marketDefinitionId, table.outcomeDefinitionId],
      foreignColumns: [
        outcomeDefinitions.marketDefinitionId,
        outcomeDefinitions.id,
      ],
    }).onDelete("restrict"),
    index("provider_market_mappings_market_definition_id_idx").on(
      table.marketDefinitionId,
    ),
    index("provider_market_mappings_outcome_definition_id_idx").on(
      table.outcomeDefinitionId,
    ),
  ],
);

export const eventMarkets = marketSchema.table(
  "event_markets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "restrict" }),
    marketDefinitionId: uuid("market_definition_id")
      .notNull()
      .references(() => marketDefinitions.id, { onDelete: "restrict" }),
    subjectParticipantId: uuid("subject_participant_id").references(
      () => participants.id,
      { onDelete: "restrict" },
    ),
    lineValue: numeric("line_value", {
      precision: 12,
      scale: 4,
      mode: "string",
    }),
    canonicalKey: text("canonical_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("event_markets_canonical_key_unique").on(table.canonicalKey),
    unique("event_markets_id_market_definition_id_unique").on(
      table.id,
      table.marketDefinitionId,
    ),
    index("event_markets_event_id_market_definition_id_idx").on(
      table.eventId,
      table.marketDefinitionId,
    ),
    index("event_markets_market_definition_id_idx").on(
      table.marketDefinitionId,
    ),
    index("event_markets_subject_participant_id_idx").on(
      table.subjectParticipantId,
    ),
    check(
      "event_markets_line_value_finite_check",
      sql`${table.lineValue} is null or ${table.lineValue}::text not in ('NaN', 'Infinity', '-Infinity')`,
    ),
  ],
);

export const eventMarketOutcomes = marketSchema.table(
  "event_market_outcomes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventMarketId: uuid("event_market_id").notNull(),
    marketDefinitionId: uuid("market_definition_id").notNull(),
    outcomeDefinitionId: uuid("outcome_definition_id").notNull(),
    canonicalKey: text("canonical_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("event_market_outcomes_canonical_key_unique").on(table.canonicalKey),
    unique("event_market_outcomes_market_outcome_unique").on(
      table.eventMarketId,
      table.outcomeDefinitionId,
    ),
    foreignKey({
      name: "event_market_outcomes_event_market_definition_fk",
      columns: [table.eventMarketId, table.marketDefinitionId],
      foreignColumns: [eventMarkets.id, eventMarkets.marketDefinitionId],
    }).onDelete("restrict"),
    foreignKey({
      name: "event_market_outcomes_definition_outcome_fk",
      columns: [table.marketDefinitionId, table.outcomeDefinitionId],
      foreignColumns: [
        outcomeDefinitions.marketDefinitionId,
        outcomeDefinitions.id,
      ],
    }).onDelete("restrict"),
    index("event_market_outcomes_definition_outcome_idx").on(
      table.marketDefinitionId,
      table.outcomeDefinitionId,
    ),
    index("event_market_outcomes_outcome_definition_id_idx").on(
      table.outcomeDefinitionId,
    ),
  ],
);

export const bookmakers = marketSchema.table(
  "bookmakers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    displayName: text("display_name").notNull(),
    synthetic: boolean("synthetic").notNull(),
    marketClassification: text("market_classification")
      .notNull()
      .default("UNCLASSIFIED"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [unique("bookmakers_code_unique").on(table.code)],
);

export const oddsObservations = marketSchema.table(
  "odds_observations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceObservationId: uuid("source_observation_id")
      .notNull()
      .references(() => sourceObservations.id, { onDelete: "restrict" }),
    eventMarketOutcomeId: uuid("event_market_outcome_id")
      .notNull()
      .references(() => eventMarketOutcomes.id, { onDelete: "restrict" }),
    bookmakerId: uuid("bookmaker_id")
      .notNull()
      .references(() => bookmakers.id, { onDelete: "restrict" }),
    decimalOdds: numeric("decimal_odds", {
      precision: 18,
      scale: 8,
      mode: "string",
    }).notNull(),
    providerObservedAt: timestamp("provider_observed_at", {
      withTimezone: true,
    }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    normalizedAt: timestamp("normalized_at", { withTimezone: true }).notNull(),
    status: text("status").notNull(),
    isSynthetic: boolean("is_synthetic").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("odds_observations_source_outcome_bookmaker_unique").on(
      table.sourceObservationId,
      table.eventMarketOutcomeId,
      table.bookmakerId,
    ),
    index("odds_observations_outcome_bookmaker_observed_at_idx").on(
      table.eventMarketOutcomeId,
      table.bookmakerId,
      table.providerObservedAt.desc(),
    ),
    index("odds_observations_bookmaker_observed_at_idx").on(
      table.bookmakerId,
      table.providerObservedAt.desc(),
    ),
    index("odds_observations_received_at_idx").on(table.receivedAt.desc()),
    check(
      "odds_observations_decimal_odds_check",
      sql`${table.decimalOdds}::text not in ('NaN', 'Infinity', '-Infinity') and ${table.decimalOdds} > 1`,
    ),
    check(
      "odds_observations_status_check",
      sql`${table.status} in ('ACTIVE', 'SUSPENDED', 'REMOVED')`,
    ),
  ],
);
