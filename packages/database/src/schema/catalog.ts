import { sql } from "drizzle-orm";
import {
  boolean,
  char,
  check,
  index,
  numeric,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { providers } from "./operations.js";
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

/**
 * The bridge from a provider's own competition reference to VELYQ's internal
 * competition -- never columns on `competitions` itself.
 *
 * A real production defect mapped Brazil's Série A to Italy's because the
 * resolver keyed on display name alone; `resolveCompetitionIdentity`
 * (`@velyq/domain`) is the only thing allowed to consume this table, and it
 * matches solely on `(provider_id, provider_competition_id)`. This is a
 * separate table rather than provider-specific columns on `competitions` for
 * the same reason `event_identities` is separate from `events`: one
 * competition can be reported by several providers under several different
 * source keys, which a single set of columns on the core catalog row cannot
 * represent.
 *
 * `mapping_status` gives a bridge row a review lifecycle: a newly-discovered
 * provider identity is `PENDING_REVIEW` until an administrator confirms it,
 * and the resolver fails closed on anything but `CONFIRMED` -- an unverified
 * guess must never silently start resolving real predictions.
 */
export const competitionIdentities = catalogSchema.table(
  "competition_identities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /* Nullable: a REJECTED row, or a PENDING_REVIEW row nobody has matched
       to a catalog competition yet, has no competition to point at. */
    competitionId: uuid("competition_id").references(() => competitions.id, {
      onDelete: "restrict",
    }),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "restrict" }),
    providerCompetitionId: text("provider_competition_id").notNull(),
    displayName: text("display_name").notNull(),
    countryCode: char("country_code", { length: 2 }),
    /* The provider-neutral, non-display-derived model competition key --
       @velyq/research's `CompetitionPolicyEntry.canonicalCode`
       (packages/research/src/competitions.ts), e.g. "ITA_SERIE_A". Never
       derived from `catalog.competitions.code` (an internal slug like
       "serie-a" that has no defined relationship to the model's own code
       space) -- the forecast cycle reads this column directly as the
       model competition key, falling back to `competitions.code` only
       when this is null, for schemas seeded before this column existed. */
    canonicalCode: text("canonical_code"),
    mappingStatus: text("mapping_status").notNull(),
    /* 0..1 confidence in an automated or provisional match; null once a row
       is human-verified, since a verified mapping needs no confidence
       score -- it needs the verification timestamp below. */
    mappingConfidence: numeric("mapping_confidence", {
      precision: 4,
      scale: 3,
    }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("competition_identities_provider_identity_unique").on(
      table.providerId,
      table.providerCompetitionId,
    ),
    index("competition_identities_competition_id_idx").on(table.competitionId),
    check(
      "competition_identities_mapping_status_check",
      sql`${table.mappingStatus} in ('CONFIRMED', 'PENDING_REVIEW', 'REJECTED')`,
    ),
    check(
      "competition_identities_confidence_range_check",
      sql`${table.mappingConfidence} is null or (${table.mappingConfidence} >= 0 and ${table.mappingConfidence} <= 1)`,
    ),
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
    /*
     * The storage form of `DataOrigin` (`@velyq/domain`): `true` means
     * SYNTHETIC_DEMO, `false` means LIVE. This column used to carry a
     * `CHECK (synthetic = true)` constraint from when the schema was
     * synthetic-data-only; that constraint is gone (VELYQ now ingests real
     * provider fixtures), but the invariant it protected has not
     * disappeared, it has moved: a LIVE row (`synthetic = false`) is
     * required, via `events_provenance_required` (a deferred constraint
     * trigger -- not expressible as a column CHECK because it must
     * reference `catalog.event_identities` -- see
     * supabase/migrations/20260908090000_provider_identity_and_live_data.sql),
     * to have a corresponding `event_identities` row before the transaction
     * that created it commits. A row never becomes LIVE merely because this
     * column is false and nothing enforces otherwise -- see
     * `requiresProviderProvenance` in `@velyq/domain`.
     */
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
  ],
);

/**
 * The bridge from a provider's own fixture reference back to a VELYQ event.
 *
 * `events.id` for a provider-ingested event is `deterministicEventId`
 * (`@velyq/domain`) applied to `(providerCode, providerFixtureId)`, so
 * ingesting the same fixture twice is idempotent without a prior lookup --
 * but that only lets you go *from* the provider's id *to* the event, never
 * back. Anything that later needs to ask the provider about a fixture
 * already stored -- a lineup, a result, a repriced market -- needs this row
 * to make that reverse lookup possible, and a fixture reported by two
 * providers gets one row per provider pointing at the same event.
 */
export const eventIdentities = catalogSchema.table(
  "event_identities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "restrict" }),
    providerFixtureId: text("provider_fixture_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("event_identities_provider_identity_unique").on(
      table.providerId,
      table.providerFixtureId,
    ),
    unique("event_identities_event_provider_unique").on(
      table.eventId,
      table.providerId,
    ),
    index("event_identities_event_id_idx").on(table.eventId),
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
