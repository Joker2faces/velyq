import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { researchSchema } from "./schemas.js";

/**
 * The historical training corpus, kept deliberately apart from the
 * operational catalog.
 *
 * `catalog.events` and `market.*` are the record of events VELYQ tracks live,
 * with provider run lineage and append-only observation history attached.
 * Training rows are a different thing: a different publisher, a different
 * schema, a different collection time and no operational lifecycle at all.
 * Mixing them would make "how many events do we cover" unanswerable and every
 * operational query silently filter-dependent.
 */

export const dataSources = researchSchema.table(
  "data_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    displayName: text("display_name").notNull(),
    sourceUrl: text("source_url").notNull(),
    schemaNotesUrl: text("schema_notes_url").notNull(),
    termsReview: text("terms_review").notNull(),
    termsNote: text("terms_note").notNull(),
    preEventPricesAvailable: boolean("pre_event_prices_available").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("data_sources_code_unique").on(table.code),
    check(
      "data_sources_terms_review_check",
      sql`${table.termsReview} in ('PASS', 'NEEDS_OWNER_REVIEW')`,
    ),
  ],
);

export const imports = researchSchema.table(
  "imports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => dataSources.id, { onDelete: "restrict" }),
    importVersion: text("import_version").notNull(),
    sourceUri: text("source_uri").notNull(),
    sourceDivision: text("source_division").notNull(),
    sourceSeason: text("source_season").notNull(),
    seasonLabel: text("season_label").notNull(),
    canonicalCompetitionCode: text("canonical_competition_code").notNull(),
    contentSha256: text("content_sha256").notNull(),
    downloadedAt: timestamp("downloaded_at", { withTimezone: true }).notNull(),
    importedAt: timestamp("imported_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    oddsColumnFamily: text("odds_column_family").notNull(),
    closingPricesAvailable: boolean("closing_prices_available").notNull(),
    rowsRaw: integer("rows_raw").notNull(),
    rowsAccepted: integer("rows_accepted").notNull(),
    rowsRejected: integer("rows_rejected").notNull(),
    rowsUnplayed: integer("rows_unplayed").notNull(),
  },
  (table) => [
    /*
     * Identity is content, not filename: re-importing an unchanged file is a
     * no-op, and re-importing a corrected one is a new import rather than a
     * silent overwrite of the rows a model was already trained on.
     */
    unique("imports_identity_unique").on(
      table.sourceId,
      table.sourceDivision,
      table.sourceSeason,
      table.contentSha256,
    ),
    index("imports_source_id_idx").on(table.sourceId),
    index("imports_competition_season_idx").on(
      table.canonicalCompetitionCode,
      table.sourceSeason,
    ),
    check(
      "imports_odds_column_family_check",
      sql`${table.oddsColumnFamily} in ('BETBRAIN', 'MARKET_AVERAGE', 'NONE')`,
    ),
    check(
      "imports_row_counts_check",
      sql`${table.rowsRaw} >= 0 and ${table.rowsAccepted} >= 0 and ${table.rowsRejected} >= 0 and ${table.rowsUnplayed} >= 0`,
    ),
  ],
);

export const matches = researchSchema.table(
  "matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    importId: uuid("import_id")
      .notNull()
      .references(() => imports.id, { onDelete: "restrict" }),
    canonicalCompetitionCode: text("canonical_competition_code").notNull(),
    seasonLabel: text("season_label").notNull(),
    kickoffDate: date("kickoff_date").notNull(),
    kickoffTime: time("kickoff_time"),
    /*
     * The publisher's own spelling is kept beside the normalized key so a
     * mapping dispute can be traced back to what the source said rather than
     * to what normalization made of it.
     */
    sourceHomeName: text("source_home_name").notNull(),
    sourceAwayName: text("source_away_name").notNull(),
    homeTeamKey: text("home_team_key").notNull(),
    awayTeamKey: text("away_team_key").notNull(),
    homeGoals: smallint("home_goals").notNull(),
    awayGoals: smallint("away_goals").notNull(),
    halfTimeHomeGoals: smallint("half_time_home_goals"),
    halfTimeAwayGoals: smallint("half_time_away_goals"),
    mappingStatus: text("mapping_status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("matches_identity_unique").on(
      table.canonicalCompetitionCode,
      table.kickoffDate,
      table.homeTeamKey,
      table.awayTeamKey,
    ),
    index("matches_import_id_idx").on(table.importId),
    index("matches_competition_kickoff_idx").on(
      table.canonicalCompetitionCode,
      table.kickoffDate,
    ),
    index("matches_home_team_idx").on(
      table.canonicalCompetitionCode,
      table.homeTeamKey,
    ),
    index("matches_away_team_idx").on(
      table.canonicalCompetitionCode,
      table.awayTeamKey,
    ),
    check(
      "matches_goals_check",
      sql`${table.homeGoals} between 0 and 30 and ${table.awayGoals} between 0 and 30`,
    ),
    check(
      "matches_half_time_goals_check",
      sql`(${table.halfTimeHomeGoals} is null or ${table.halfTimeHomeGoals} between 0 and 30) and (${table.halfTimeAwayGoals} is null or ${table.halfTimeAwayGoals} between 0 and 30)`,
    ),
    check(
      "matches_mapping_status_check",
      sql`${table.mappingStatus} in ('RESOLVED', 'QUARANTINED')`,
    ),
    check(
      "matches_teams_distinct_check",
      sql`${table.homeTeamKey} <> ${table.awayTeamKey}`,
    ),
  ],
);

export const matchOdds = researchSchema.table(
  "match_odds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "restrict" }),
    marketCode: text("market_code").notNull(),
    outcomeCode: text("outcome_code").notNull(),
    line: numeric("line", { precision: 6, scale: 2, mode: "string" }),
    /*
     * The distinction the whole backtest rests on. PRE_CLOSING prices are
     * collected days before kickoff and are legitimate decision inputs;
     * CLOSING prices are the last thing the market knew and are evaluation
     * data only. Using a closing price to make a historical decision is
     * looking at the answer.
     */
    pricePhase: text("price_phase").notNull(),
    priceScope: text("price_scope").notNull(),
    bookmakerCode: text("bookmaker_code"),
    decimalOdds: numeric("decimal_odds", {
      precision: 12,
      scale: 4,
      mode: "string",
    }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("match_odds_identity_unique").on(
      table.matchId,
      table.marketCode,
      table.outcomeCode,
      sql`coalesce(${table.line}, -1)`,
      table.pricePhase,
      table.priceScope,
      sql`coalesce(${table.bookmakerCode}, '-')`,
    ),
    index("match_odds_market_phase_idx").on(
      table.marketCode,
      table.pricePhase,
      table.priceScope,
    ),
    check(
      "match_odds_price_phase_check",
      sql`${table.pricePhase} in ('PRE_CLOSING', 'CLOSING')`,
    ),
    check(
      "match_odds_price_scope_check",
      sql`${table.priceScope} in ('AVERAGE', 'MAXIMUM', 'BOOKMAKER')`,
    ),
    // A panel aggregate has no bookmaker; an individual price must name one.
    check(
      "match_odds_bookmaker_scope_check",
      sql`(${table.priceScope} = 'BOOKMAKER' and ${table.bookmakerCode} is not null) or (${table.priceScope} <> 'BOOKMAKER' and ${table.bookmakerCode} is null)`,
    ),
    check(
      "match_odds_decimal_odds_check",
      sql`${table.decimalOdds}::text not in ('NaN', 'Infinity', '-Infinity') and ${table.decimalOdds} > 1`,
    ),
  ],
);

export const mappingQuarantine = researchSchema.table(
  "mapping_quarantine",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    importId: uuid("import_id").references(() => imports.id, {
      onDelete: "restrict",
    }),
    canonicalCompetitionCode: text("canonical_competition_code"),
    reasonCode: text("reason_code").notNull(),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("mapping_quarantine_import_id_idx").on(table.importId),
    check(
      "mapping_quarantine_payload_object_check",
      sql`jsonb_typeof(${table.payload}) = 'object'`,
    ),
  ],
);
