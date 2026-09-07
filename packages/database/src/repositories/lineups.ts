import { and, desc, eq, gt, sql } from "drizzle-orm";
import type { PrivilegedVelyqDatabase } from "../client.js";
import {
  competitionIdentities,
  competitionProviderCoverage,
  competitions,
  eventIdentities,
  events,
  lineupObservations,
  lineupRequestLog,
  providers,
} from "../schema/index.js";
import type { LineupAvailabilityState } from "@velyq/analytics/decision-timing";

/**
 * Resolves, per event, which of the three lineup states applies.
 *
 * This is the join the decision policy depends on and it deliberately does not
 * guess. There are three genuinely different answers and the difference
 * between them changes what the product should say:
 *
 * - a complete XI is stored → `LINEUP_AVAILABLE`
 * - the provider's coverage flags say this league has none → `LINEUP_NOT_COVERED`
 * - anything else → `LINEUP_NOT_PUBLISHED_YET`
 *
 * The fallback is the *middle* answer rather than either confident one. An
 * event whose coverage is simply unknown must not be reported as permanently
 * uncovered — that would silently retire a competition on missing data — nor as
 * having a lineup it does not have.
 */

export type EventLineupState = Readonly<{
  eventId: string;
  providerFixtureId: string | null;
  availability: LineupAvailabilityState;
  /** Null when no coverage row exists for the competition. */
  lineupsCovered: boolean | null;
  /** Teams with a stored XI of at least eleven starters. */
  completeTeams: number;
  lastCheckedAt: string | null;
}>;

/** A stored XI counts only when it names a real starting eleven. */
const MINIMUM_STARTERS = 11;

export async function loadLineupStates(
  database: PrivilegedVelyqDatabase,
  eventIds: readonly string[],
): Promise<ReadonlyMap<string, EventLineupState>> {
  const states = new Map<string, EventLineupState>();
  if (eventIds.length === 0) return states;

  /*
   * Coverage is keyed by the provider's league id, and the bridge from an
   * event to that id runs through `competition_identities`. Left-joined
   * throughout: an event with no identity row is the unknown-coverage case,
   * which has to survive the query rather than be filtered out of it.
   */
  const rows = await database
    .select({
      eventId: events.id,
      lineupsCovered: competitionProviderCoverage.lineups,
      providerLeagueId: competitionIdentities.sourceKey,
    })
    .from(events)
    .innerJoin(competitions, eq(events.competitionId, competitions.id))
    .leftJoin(
      competitionIdentities,
      and(
        eq(competitionIdentities.canonicalCode, competitions.canonicalCode),
        eq(competitionIdentities.sourceCode, "API_SPORTS"),
      ),
    )
    .leftJoin(
      competitionProviderCoverage,
      and(
        eq(
          competitionProviderCoverage.providerLeagueId,
          competitionIdentities.sourceKey,
        ),
        eq(competitionProviderCoverage.isCurrent, true),
      ),
    )
    .where(
      sql`${events.id} in ${sql.raw(`(${eventIds.map((id) => `'${id}'`).join(",")})`)}`,
    );

  const observed = await database
    .select({
      eventId: lineupObservations.eventId,
      teamParticipantId: lineupObservations.teamParticipantId,
      starters: lineupObservations.starters,
      providerFixtureId: lineupObservations.providerFixtureId,
    })
    .from(lineupObservations)
    .where(
      sql`${lineupObservations.eventId} in ${sql.raw(`(${eventIds.map((id) => `'${id}'`).join(",")})`)}`,
    );

  const checked = await database
    .select({
      eventId: lineupRequestLog.eventId,
      requestedAt: lineupRequestLog.requestedAt,
      providerFixtureId: lineupRequestLog.providerFixtureId,
    })
    .from(lineupRequestLog)
    .where(
      sql`${lineupRequestLog.eventId} in ${sql.raw(`(${eventIds.map((id) => `'${id}'`).join(",")})`)}`,
    )
    .orderBy(desc(lineupRequestLog.requestedAt));

  const completeTeams = new Map<string, Set<string>>();
  const fixtureIds = new Map<string, string>();
  for (const row of observed) {
    if (row.providerFixtureId)
      fixtureIds.set(row.eventId, row.providerFixtureId);
    if ((row.starters ?? 0) < MINIMUM_STARTERS) continue;
    const teams = completeTeams.get(row.eventId) ?? new Set<string>();
    teams.add(row.teamParticipantId);
    completeTeams.set(row.eventId, teams);
  }
  const lastChecked = new Map<string, string>();
  for (const row of checked) {
    if (!lastChecked.has(row.eventId))
      lastChecked.set(row.eventId, row.requestedAt.toISOString());
    if (!fixtureIds.has(row.eventId) && row.providerFixtureId)
      fixtureIds.set(row.eventId, row.providerFixtureId);
  }

  for (const eventId of eventIds) {
    const coverageRows = rows.filter((row) => row.eventId === eventId);
    /*
     * `some(... === true)` rather than a truthiness check: a null from the
     * left join means no coverage row, which is unknown, and unknown must not
     * collapse into false.
     */
    const covered = coverageRows.some((row) => row.lineupsCovered === true)
      ? true
      : coverageRows.some((row) => row.lineupsCovered === false)
        ? false
        : null;
    const teams = completeTeams.get(eventId)?.size ?? 0;
    states.set(eventId, {
      eventId,
      providerFixtureId: fixtureIds.get(eventId) ?? null,
      availability:
        teams >= 2
          ? "LINEUP_AVAILABLE"
          : covered === false
            ? "LINEUP_NOT_COVERED"
            : "LINEUP_NOT_PUBLISHED_YET",
      lineupsCovered: covered,
      completeTeams: teams,
      lastCheckedAt: lastChecked.get(eventId) ?? null,
    });
  }
  return states;
}

export type PersistedLineup = Readonly<{
  eventId: string;
  providerFixtureId: string;
  teamParticipantId: string;
  formation: string | null;
  coachName: string | null;
  providerCoachId: string | null;
  starters: number;
  substitutes: number;
  players: readonly unknown[];
  sourceObservationId: string;
  observedAt: Date;
}>;

/**
 * Appends a lineup observation.
 *
 * Append-only and keyed on the source observation, so re-ingesting the same
 * provider response is a no-op while a genuinely changed XI — a late injury,
 * a corrected sheet — becomes a new row. That history is the point: a model
 * that wants to learn what a lineup change does to a price needs both
 * versions, not the latest one.
 */
export async function appendLineupObservation(
  database: PrivilegedVelyqDatabase,
  lineup: PersistedLineup,
): Promise<boolean> {
  const inserted = await database
    .insert(lineupObservations)
    .values({
      sourceObservationId: lineup.sourceObservationId,
      eventId: lineup.eventId,
      teamParticipantId: lineup.teamParticipantId,
      schemaVersion: "api-sports.lineups.v1",
      status: "OFFICIAL",
      confidence: null,
      players: lineup.players,
      formation: lineup.formation,
      providerFixtureId: lineup.providerFixtureId,
      coachName: lineup.coachName,
      providerCoachId: lineup.providerCoachId,
      starters: lineup.starters,
      substitutes: lineup.substitutes,
      providerObservedAt: lineup.observedAt,
      receivedAt: lineup.observedAt,
    })
    .onConflictDoNothing()
    .returning({ id: lineupObservations.id });
  return inserted.length > 0;
}

export async function recordLineupRequest(
  database: PrivilegedVelyqDatabase,
  entry: Readonly<{
    eventId: string;
    providerFixtureId: string;
    availability: LineupAvailabilityState;
    minutesToKickoff: number;
    pollWindow: string;
    teamsReturned: number;
    requestedAt: Date;
  }>,
): Promise<void> {
  const [provider] = await database
    .select({ id: providers.id })
    .from(providers)
    .where(eq(providers.code, "API_SPORTS"))
    .limit(1);
  if (!provider) return;
  await database.insert(lineupRequestLog).values({
    eventId: entry.eventId,
    providerId: provider.id,
    providerFixtureId: entry.providerFixtureId,
    requestedAt: entry.requestedAt,
    availability: entry.availability,
    /* Rounded: the column is an integer and a fractional minute is noise. */
    minutesToKickoff: Math.round(entry.minutesToKickoff),
    pollWindow: entry.pollWindow,
    teamsReturned: entry.teamsReturned,
  });
}

/**
 * Events still ahead of kickoff that the provider can actually be asked about.
 *
 * Inner-joined to the provider identity rather than left-joined: a fixture
 * VELYQ knows about from another source has no API-Sports id to send, and
 * carrying it through the scheduler as a candidate with a null id would spend
 * planning effort on a request that can never be made.
 */
export async function loadLineupCandidateEvents(
  database: PrivilegedVelyqDatabase,
  asOf: Date,
  horizonHours: number,
): Promise<
  readonly Readonly<{
    eventId: string;
    providerFixtureId: string;
    kickoffAt: string;
    canonicalCode: string | null;
  }>[]
> {
  const horizonEnd = new Date(asOf.getTime() + horizonHours * 3_600_000);
  const rows = await database
    .select({
      eventId: events.id,
      startsAt: events.startsAt,
      canonicalCode: competitions.canonicalCode,
      providerFixtureId: eventIdentities.sourceKey,
    })
    .from(events)
    .innerJoin(competitions, eq(events.competitionId, competitions.id))
    .innerJoin(
      eventIdentities,
      and(
        eq(eventIdentities.eventId, events.id),
        eq(eventIdentities.sourceCode, "API_SPORTS"),
      ),
    )
    .where(and(eq(events.synthetic, false), gt(events.startsAt, asOf)));
  return rows
    .filter((row) => row.startsAt <= horizonEnd)
    .map((row) => ({
      eventId: row.eventId,
      providerFixtureId: row.providerFixtureId,
      kickoffAt: row.startsAt.toISOString(),
      canonicalCode: row.canonicalCode,
    }));
}
