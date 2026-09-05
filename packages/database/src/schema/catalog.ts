import { sql } from "drizzle-orm";
import {
  boolean,
  char,
  check,
  index,
  primaryKey,
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("competitions_sport_id_code_unique").on(table.sportId, table.code),
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
    check("events_phase_one_synthetic_check", sql`${table.synthetic} = true`),
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
