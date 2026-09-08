import { and, eq } from "drizzle-orm";
import {
  dataOriginToSyntheticColumn,
  deterministicEventId,
  resolveCompetitionIdentity,
  resolveTeamIdentity,
  type CompetitionIdentityBridgeRow,
  type TeamAliasLookup,
} from "@velyq/domain";
import type { NormalizedEvent } from "@velyq/providers";

import type {
  PrivilegedVelyqDatabase,
  RepositoryTransaction,
} from "../client.js";
import {
  competitionIdentities,
  eventIdentities,
  eventParticipants,
  events,
  participants,
} from "../schema/catalog.js";

type Database = PrivilegedVelyqDatabase | RepositoryTransaction;

export type FixtureIngestionRejection = Readonly<{
  ok: false;
  reason:
    | "COMPETITION_PROVIDER_ID_MISSING"
    | "UNRESOLVED_COMPETITION"
    | "AMBIGUOUS_PROVIDER_IDENTITY"
    | "MAPPING_PENDING_REVIEW"
    | "MAPPING_REJECTED"
    | "TEAM_NOT_IN_MODEL";
  detail?: string;
}>;

export type FixtureIngestionSuccess = Readonly<{
  ok: true;
  eventId: string;
  competitionId: string;
  homeParticipantId: string;
  awayParticipantId: string;
}>;

export type FixtureIngestionResult =
  FixtureIngestionSuccess | FixtureIngestionRejection;

/**
 * Resolves a normalized provider fixture through VELYQ's identity resolvers
 * and, only if every identity resolves, writes it as a LIVE event -- the
 * real fixture write path competition/team/event identity feed into.
 *
 * Every rejection reason is returned, never thrown: a fixture that cannot
 * yet be placed (an unmapped competition, a team with no verified catalog
 * entry) is a normal, expected outcome of real provider data, not an error.
 * Nothing is written when the result is a rejection.
 */
export async function ingestFootballFixture(
  database: PrivilegedVelyqDatabase,
  input: Readonly<{
    providerId: string;
    providerCode: string;
    sportId: string;
    event: NormalizedEvent;
    /** Every competition_identities bridge row for `providerId`, loaded by
        the caller so this function stays a pure resolver over data it is
        handed rather than owning its own query shape. */
    competitionBridge: readonly CompetitionIdentityBridgeRow[];
    /** Verified alias lookup for the competition this fixture resolves to,
        e.g. `teamAliasLookupFor(competitionCode)` from @velyq/providers. */
    teamAliasLookup: (competitionCode: string) => TeamAliasLookup;
  }>,
): Promise<FixtureIngestionResult> {
  const { event } = input;
  if (event.competitionProviderId === null) {
    return { ok: false, reason: "COMPETITION_PROVIDER_ID_MISSING" };
  }

  const competitionResolution = resolveCompetitionIdentity(
    {
      /* `resolveCompetitionIdentity`'s `providerCode` is matched by plain
         equality against `CompetitionIdentityBridgeRow.providerCode` --
         `loadCompetitionBridge` below populates that field with the same
         provider *row id* used here, not the human-readable provider code,
         so the two sides agree on what "the same provider" means. */
      providerCode: input.providerId,
      providerCompetitionId: event.competitionProviderId,
      displayName: event.competition,
      countryCode: event.competitionCountryCode,
    },
    input.competitionBridge,
  );
  if (!competitionResolution.ok) {
    return { ok: false, reason: competitionResolution.reason };
  }
  const competitionId = competitionResolution.competitionId;

  return database.transaction(async (transaction) => {
    const competitionRow = await transaction.query.competitions.findFirst({
      where: (table, { eq: whereEq }) => whereEq(table.id, competitionId),
    });
    if (!competitionRow) {
      /* The bridge row pointed at a competition id the catalog no longer
         has -- a data-integrity problem for an administrator, not something
         to guess past. */
      return { ok: false, reason: "UNRESOLVED_COMPETITION" } as const;
    }

    const aliasLookup = input.teamAliasLookup(competitionRow.code);
    const [homeName, awayName] = event.participants;
    if (homeName === undefined || awayName === undefined) {
      return { ok: false, reason: "UNRESOLVED_COMPETITION" } as const;
    }

    const resolvedTeams: Record<"home" | "away", string> = {
      home: "",
      away: "",
    };
    for (const [role, sourceName] of [
      ["home", homeName],
      ["away", awayName],
    ] as const) {
      const normalizedName = normalizeTeamKey(sourceName);
      const known = await transaction
        .select({ id: participants.id, code: participants.code })
        .from(participants)
        .where(
          and(
            eq(participants.sportId, input.sportId),
            eq(participants.type, "TEAM"),
          ),
        );
      const knownTeamKeys = new Set(known.map((row) => row.code));
      const resolution = resolveTeamIdentity({
        sourceName,
        normalizedName,
        aliasLookup,
        knownTeamKeys,
      });

      if (resolution.status === "TEAM_NOT_IN_MODEL") {
        return {
          ok: false,
          reason: "TEAM_NOT_IN_MODEL",
          detail: `${sourceName} -> ${resolution.teamKey}`,
        } as const;
      }

      const teamKey =
        resolution.status === "UNRESOLVED_TEAM"
          ? normalizedName
          : resolution.teamKey;
      const existing = known.find((row) => row.code === teamKey);
      const participantId =
        existing?.id ??
        (
          await transaction
            .insert(participants)
            .values({
              sportId: input.sportId,
              type: "TEAM",
              code: teamKey,
              displayName: sourceName,
            })
            .onConflictDoNothing({
              target: [
                participants.sportId,
                participants.type,
                participants.code,
              ],
            })
            .returning({ id: participants.id })
        )[0]?.id ??
        (
          await transaction.query.participants.findFirst({
            where: (table, { eq: whereEq }) =>
              and(
                whereEq(table.sportId, input.sportId),
                whereEq(table.type, "TEAM"),
                whereEq(table.code, teamKey),
              ),
          })
        )?.id;
      if (!participantId) throw new Error("PARTICIPANT_PERSISTENCE_FAILED");
      resolvedTeams[role] = participantId;
    }

    const eventId = deterministicEventId(
      input.providerCode,
      event.providerEventId,
    );

    await transaction
      .insert(events)
      .values({
        id: eventId,
        sportId: input.sportId,
        competitionId,
        seasonLabel: event.season === null ? null : String(event.season),
        startsAt: new Date(event.scheduledAt),
        status: event.status,
        synthetic: dataOriginToSyntheticColumn("LIVE"),
      })
      .onConflictDoUpdate({
        target: events.id,
        set: {
          startsAt: new Date(event.scheduledAt),
          status: event.status,
        },
      });

    for (const [role, participantId] of [
      ["HOME", resolvedTeams.home],
      ["AWAY", resolvedTeams.away],
    ] as const) {
      await transaction
        .insert(eventParticipants)
        .values({ eventId, participantId, role })
        .onConflictDoUpdate({
          target: [eventParticipants.eventId, eventParticipants.role],
          set: { participantId },
        });
    }

    await transaction
      .insert(eventIdentities)
      .values({
        eventId,
        providerId: input.providerId,
        providerFixtureId: event.providerEventId,
      })
      .onConflictDoNothing({
        target: [eventIdentities.providerId, eventIdentities.providerFixtureId],
      });

    return {
      ok: true,
      eventId,
      competitionId,
      homeParticipantId: resolvedTeams.home,
      awayParticipantId: resolvedTeams.away,
    } as const;
  });
}

/** Case, punctuation and accents removed; nothing else -- mirrors the
    normalization `resolveTeamIdentity`'s callers are expected to apply
    before calling it (see @velyq/domain). Deliberately does not strip
    club-type words: dropping "Sporting" would collapse Sporting Lisbon and
    Sporting Gijón, and dropping "Athletic"/"Atletico" would collapse
    Athletic Bilbao and Atlético Madrid. */
export function normalizeTeamKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Loads every competition_identities bridge row for one provider, in the
    shape resolveCompetitionIdentity expects. */
export async function loadCompetitionBridge(
  database: Database,
  providerId: string,
): Promise<readonly CompetitionIdentityBridgeRow[]> {
  const rows = await database
    .select({
      competitionId: competitionIdentities.competitionId,
      providerCompetitionId: competitionIdentities.providerCompetitionId,
      displayName: competitionIdentities.displayName,
      countryCode: competitionIdentities.countryCode,
      mappingStatus: competitionIdentities.mappingStatus,
    })
    .from(competitionIdentities)
    .where(eq(competitionIdentities.providerId, providerId));

  return rows
    .filter(
      (row): row is typeof row & { competitionId: string } =>
        row.competitionId !== null,
    )
    .map((row) => ({
      competitionId:
        row.competitionId as CompetitionIdentityBridgeRow["competitionId"],
      providerCode: providerId,
      providerCompetitionId: row.providerCompetitionId,
      displayName: row.displayName,
      countryCode: row.countryCode,
      mappingStatus:
        row.mappingStatus as CompetitionIdentityBridgeRow["mappingStatus"],
    }));
}
