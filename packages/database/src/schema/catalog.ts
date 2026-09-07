import { sql } from "drizzle-orm";
import {
  boolean,
  char,
  check,
  index,
  integer,
  jsonb,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { catalogSchema } from "./schemas.js";

export const sports = catalogSchema.table(
  "sports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    nameKey: text("name_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("sports_code_unique").on(table.code),
    unique("sports_name_key_unique").on(table.nameKey),
  ],
);

export const competitions = catalogSchema.table(
  "competitions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sportId: uuid("sport_id")
      .notNull()
      .references(() => sports.id, { onDelete: "restrict" }),
    code: text("code").notNull(),
    nameKey: text("name_key").notNull(),
    countryCode: char("country_code", { length: 2 }),
    /*
     * Nullable on purpose. An event whose competition has no canonical
     * mapping is not an error, it is a competition with no policy: it stays
     * in the catalog, stays visible in admin, and is ineligible for customer
     * intelligence because the resolver fails closed rather than guessing.
     */
    canonicalCode: text("canonical_code"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("competitions_sport_id_code_unique").on(table.sportId, table.code),
    index("competitions_canonical_code_idx").on(table.canonicalCode),
  ],
);

/**
 * What the provider says it can supply for a league and season.
 *
 * Cached deliberately. The free plan allows 100 requests a day across every
 * endpoint, and asking a league whose `lineups` flag is false for a lineup is
 * a request wasted permanently rather than just now. One
 * `/leagues?current=true` call fills this for every league at once.
 *
 * An unknown coverage state is the *absence* of a row rather than a null
 * column, which the lineup scheduler treats as "ask once" — neither of the
 * two confident answers.
 */
export const competitionProviderCoverage = catalogSchema.table(
  "competition_provider_coverage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: uuid("provider_id").notNull(),
    providerLeagueId: text("provider_league_id").notNull(),
    leagueName: text("league_name").notNull(),
    countryName: text("country_name"),
    countryCode: char("country_code", { length: 2 }),
    season: integer("season").notNull(),
    isCurrent: boolean("is_current").notNull(),
    lineups: boolean("lineups").notNull(),
    odds: boolean("odds").notNull(),
    predictions: boolean("predictions").notNull(),
    injuries: boolean("injuries").notNull(),
    statistics: boolean("statistics").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("competition_provider_coverage_identity_unique").on(
      table.providerId,
      table.providerLeagueId,
      table.season,
    ),
    index("competition_provider_coverage_current_idx").on(
      table.providerId,
      table.isCurrent,
    ),
    check(
      "competition_provider_coverage_season_check",
      sql`${table.season} between 1900 and 2100`,
    ),
  ],
);

export const competitionPolicyVersions = catalogSchema.table(
  "competition_policy_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    version: text("version").notNull(),
    definition: jsonb("definition").notNull(),
    effectiveFrom: timestamp("effective_from", {
      withTimezone: true,
    }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("competition_policy_versions_version_unique").on(table.version),
    check(
      "competition_policy_versions_definition_object_check",
      sql`jsonb_typeof(${table.definition}) = 'object'`,
    ),
  ],
);

/**
 * Which competitions may become customer intelligence, and on what evidence.
 *
 * "Discovered" and "worth showing a customer" are different questions.
 * Eligibility is decided by whether a trained model covers the competition,
 * whether enough historical sample sits behind it and whether enough
 * bookmakers price it — never by how famous the teams are.
 */
export const competitionPolicies = catalogSchema.table(
  "competition_policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    policyVersionId: uuid("policy_version_id")
      .notNull()
      .references(() => competitionPolicyVersions.id, { onDelete: "restrict" }),
    sportId: uuid("sport_id")
      .notNull()
      .references(() => sports.id, { onDelete: "restrict" }),
    canonicalCode: text("canonical_code").notNull(),
    displayName: text("display_name").notNull(),
    countryCode: char("country_code", { length: 2 }),
    tier: smallint("tier").notNull(),
    state: text("state").notNull(),
    modelEligible: boolean("model_eligible").notNull(),
    customerVisible: boolean("customer_visible").notNull(),
    minHistoricalSample: integer("min_historical_sample").notNull(),
    minBookmakerCoverage: integer("min_bookmaker_coverage").notNull(),
    /*
     * An administrator can narrow eligibility but never widen it past the
     * evidence: widening would be a way to publish an unvalidated model
     * through a configuration change. The narrowing rule is enforced in
     * application code, which is where the evidence being compared against
     * actually lives.
     */
    manualOverride: text("manual_override"),
    overrideReason: text("override_reason"),
    reasonCodes: text("reason_codes").array().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("competition_policies_identity_unique").on(
      table.policyVersionId,
      table.canonicalCode,
    ),
    index("competition_policies_canonical_code_idx").on(table.canonicalCode),
    index("competition_policies_sport_id_idx").on(table.sportId),
    check(
      "competition_policies_state_check",
      sql`${table.state} in ('PRIME', 'SUPPORTED', 'EXPERIMENTAL', 'ADMIN_ONLY', 'EXCLUDED')`,
    ),
    check(
      "competition_policies_manual_override_check",
      sql`${table.manualOverride} is null or ${table.manualOverride} in ('PRIME', 'SUPPORTED', 'EXPERIMENTAL', 'ADMIN_ONLY', 'EXCLUDED')`,
    ),
    check(
      "competition_policies_override_reason_check",
      sql`${table.manualOverride} is null or ${table.overrideReason} is not null`,
    ),
    // Running inference on a competition nobody may see has no purpose.
    check(
      "competition_policies_visibility_check",
      sql`${table.customerVisible} or not ${table.modelEligible}`,
    ),
    check(
      "competition_policies_thresholds_check",
      sql`${table.minHistoricalSample} >= 0 and ${table.minBookmakerCoverage} >= 0`,
    ),
  ],
);

/**
 * The bridge from a provider's own competition key to the canonical code the
 * policy is written against.
 *
 * Provider names are ambiguous across countries — "Premier League" exists in
 * a dozen of them — so a provider key resolves only through an explicit row
 * here, never through a name match alone.
 */
export const competitionIdentities = catalogSchema.table(
  "competition_identities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    canonicalCode: text("canonical_code").notNull(),
    sourceCode: text("source_code").notNull(),
    sourceKey: text("source_key").notNull(),
    sourceName: text("source_name").notNull(),
    countryCode: char("country_code", { length: 2 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("competition_identities_identity_unique").on(
      table.sourceCode,
      table.sourceKey,
    ),
    index("competition_identities_canonical_code_idx").on(table.canonicalCode),
  ],
);

export const participants = catalogSchema.table(
  "participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sportId: uuid("sport_id")
      .notNull()
      .references(() => sports.id, { onDelete: "restrict" }),
    type: text("type").notNull(),
    code: text("code").notNull(),
    displayName: text("display_name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("participants_sport_id_type_code_unique").on(
      table.sportId,
      table.type,
      table.code,
    ),
    check("participants_type_check", sql`${table.type} in ('TEAM', 'PLAYER')`),
  ],
);

export const events = catalogSchema.table(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sportId: uuid("sport_id")
      .notNull()
      .references(() => sports.id, { onDelete: "restrict" }),
    competitionId: uuid("competition_id")
      .notNull()
      .references(() => competitions.id, { onDelete: "restrict" }),
    seasonLabel: text("season_label"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    status: text("status").notNull(),
    synthetic: boolean("synthetic").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("events_starts_at_status_idx").on(table.startsAt, table.status),
    index("events_competition_id_starts_at_idx").on(
      table.competitionId,
      table.startsAt,
    ),
    index("events_sport_id_idx").on(table.sportId),
    /*
     * Mirrors 20260907121500_allow_real_catalog_events, which dropped the
     * phase-one constraint that forced every catalog event to be synthetic.
     * Real provider ingestion writes `synthetic = false` into these same
     * tables; provenance lives on the event/provider/observation rows. This
     * definition had been left at `= true`, so regenerating migrations from
     * the schema would have re-added a constraint production has removed and
     * that real ingestion violates.
     */
    check(
      "events_synthetic_boolean_check",
      sql`${table.synthetic} in (true, false)`,
    ),
  ],
);

export const eventParticipants = catalogSchema.table(
  "event_participants",
  {
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "restrict" }),
    participantId: uuid("participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "restrict" }),
    role: text("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "event_participants_pkey",
      columns: [table.eventId, table.role],
    }),
    unique("event_participants_event_id_participant_id_unique").on(
      table.eventId,
      table.participantId,
    ),
    index("event_participants_participant_id_idx").on(table.participantId),
    check(
      "event_participants_role_check",
      sql`${table.role} in ('HOME', 'AWAY')`,
    ),
  ],
);
