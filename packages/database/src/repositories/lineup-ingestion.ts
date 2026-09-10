import { and, eq } from "drizzle-orm";
import { createHash } from "node:crypto";
/*
 * The threshold comes from `@velyq/domain` and the shape from
 * `@velyq/providers` as a TYPE import only. Importing a value from the
 * providers package root pulls in its synthetic replay module, whose fixture
 * path webpack cannot resolve -- which failed the admin build.
 */
import { STARTING_ELEVEN } from "@velyq/domain";
import type { NormalizedLineup } from "@velyq/providers";
import type { PrivilegedVelyqDatabase } from "../client.js";
import {
  eventIdentities,
  eventParticipants,
  participants,
} from "../schema/catalog.js";
import { normalizeTeamKey } from "./fixture-ingestion.js";
import { lineupObservations } from "../schema/intelligence.js";
import { providerSyncRuns, sourceObservations } from "../schema/operations.js";

/**
 * Lineup ingestion.
 *
 * The sheet is stored as an observation, never as a mutable current state: a
 * provisional eleven and the confirmed one that replaces it are two rows, so
 * "what did we know, and when" stays answerable. That is what the evidence
 * timeline and the post-match autopsy read, and it is the only way a
 * lineup-triggered recomputation can show a before and an after.
 *
 * The team is resolved against the fixture's OWN two participants, not by a
 * global name lookup. There is no provider-team-id mapping table, so a name is
 * all there is to match on -- but constraining the candidates to the two teams
 * already recorded for this event means an ambiguous club name cannot pull in
 * a team from a different match. If neither side matches, the sheet is skipped
 * with a reason rather than attached to a guess: a lineup on the wrong team
 * inverts the home/away reading of the whole fixture.
 */

export type LineupIngestionSummary = Readonly<{
  received: number;
  written: number;
  duplicate: number;
  /** Fixtures whose starting eleven is now complete. */
  official: number;
  skippedByReason: Readonly<Record<string, number>>;
  /**
   * The best status reached per fixture, for the ask marker.
   *
   * Best rather than last: a fixture has two lineups, and if one team's sheet
   * is confirmed while the other is still provisional the fixture as a whole
   * is not answered. Recording OFFICIAL because the second row happened to be
   * complete would stop us asking for the first.
   */
  statusByProviderFixtureId: Readonly<Record<string, string>>;
  /**
   * Internal event ids that received a genuinely new lineup observation this
   * call (not a duplicate, not skipped). This is the only signal a caller has
   * that a forecast might now be worth recomputing before the next scheduled
   * cycle -- the writer is the one place that already knows "new sheet just
   * landed" versus "same sheet reported again."
   */
  eventIdsWithNewObservations: readonly string[];
}>;

function bump(counter: Record<string, number>, key: string): void {
  counter[key] = (counter[key] ?? 0) + 1;
}

/** OFFICIAL only when the fixture's own weakest sheet is complete. */
const STATUS_RANK: Readonly<Record<string, number>> = {
  UNAVAILABLE: 0,
  EXPECTED: 1,
  OFFICIAL: 2,
};

export async function ingestFootballLineups(
  database: PrivilegedVelyqDatabase,
  input: Readonly<{
    providerId: string;
    lineups: readonly NormalizedLineup[];
    policyVersionId: string;
  }>,
): Promise<LineupIngestionSummary> {
  const skippedByReason: Record<string, number> = {};
  const statusByProviderFixtureId: Record<string, string> = {};
  let written = 0;
  let duplicate = 0;

  if (input.lineups.length === 0) {
    return {
      received: 0,
      written: 0,
      duplicate: 0,
      official: 0,
      skippedByReason,
      statusByProviderFixtureId,
      eventIdsWithNewObservations: [],
    };
  }

  /*
   * One sync run for the batch. A fixture's two lineups arrive from one
   * provider request, so they are one act of synchronisation.
   */
  const [syncRun] = await database
    .insert(providerSyncRuns)
    .values({
      providerId: input.providerId,
      capability: "LINEUP",
      status: "COMPLETED",
      providerSchemaVersion: "api-sports.v1",
      normalizationVersion: "api-sports.v1",
      mappingVersion: "api-sports.v1",
      policyVersionId: input.policyVersionId,
      startedAt: new Date(),
      completedAt: new Date(),
      receivedCount: input.lineups.length,
    })
    .returning({ id: providerSyncRuns.id });
  if (!syncRun) throw new Error("LINEUP_SYNC_RUN_PERSISTENCE_FAILED");

  /*
   * Tracks the weakest status seen per fixture, so a fixture counts as
   * answered only when every team's sheet is complete.
   */
  const weakestByFixture = new Map<string, string>();
  const eventIdsWithNewObservations = new Set<string>();

  for (const lineup of input.lineups) {
    const existing = weakestByFixture.get(lineup.providerEventId);
    const rank = STATUS_RANK[lineup.status] ?? 0;
    if (existing === undefined || rank < (STATUS_RANK[existing] ?? 0)) {
      weakestByFixture.set(lineup.providerEventId, lineup.status);
    }

    try {
      const outcome = await database.transaction(async (transaction) => {
        const [identity] = await transaction
          .select({ eventId: eventIdentities.eventId })
          .from(eventIdentities)
          .where(
            and(
              eq(eventIdentities.providerId, input.providerId),
              eq(eventIdentities.providerFixtureId, lineup.providerEventId),
            ),
          )
          .limit(1);
        if (!identity) {
          return { reason: "LINEUP_EVENT_IDENTITY_NOT_FOUND" as const };
        }

        /*
         * The two teams this fixture actually has. Matching within them
         * rather than across the whole participant table is what stops a
         * shared club name ("United", a reserve side) attaching a sheet to
         * another match's team.
         */
        const sides = await transaction
          .select({
            participantId: participants.id,
            code: participants.code,
            displayName: participants.displayName,
          })
          .from(eventParticipants)
          .innerJoin(
            participants,
            eq(participants.id, eventParticipants.participantId),
          )
          .where(eq(eventParticipants.eventId, identity.eventId));

        const wanted = normalizeTeamKey(lineup.teamName);
        const team =
          sides.find((side) => side.code === wanted) ??
          sides.find((side) => normalizeTeamKey(side.displayName) === wanted);
        if (!team) {
          return { reason: "LINEUP_TEAM_NOT_ON_FIXTURE" as const };
        }

        /*
         * The hash covers the players and the formation, so a changed sheet
         * is a new observation while a re-reported identical one is a
         * duplicate. That is what makes "the lineup changed" a fact we can
         * derive rather than a guess.
         */
        const contentHash = `sha256:${createHash("sha256")
          .update(
            JSON.stringify({
              provider: lineup.provider,
              eventId: identity.eventId,
              teamParticipantId: team.participantId,
              status: lineup.status,
              formation: lineup.formation,
              players: lineup.players,
              providerObservedAt: lineup.providerObservedAt,
            }),
          )
          .digest("hex")}`;

        const inserted = await transaction
          .insert(sourceObservations)
          .values({
            providerId: input.providerId,
            syncRunId: syncRun.id,
            observationType: "LINEUP",
            providerExternalId: lineup.providerEventId,
            providerObservedAt: new Date(lineup.providerObservedAt),
            receivedAt: new Date(lineup.providerObservedAt),
            normalizedAt: new Date(lineup.providerObservedAt),
            normalizationVersion: "api-sports.v1",
            mappingVersion: "api-sports.v1",
            contentHash,
          })
          .onConflictDoNothing({
            target: [
              sourceObservations.providerId,
              sourceObservations.observationType,
              sourceObservations.contentHash,
            ],
          })
          .returning({ id: sourceObservations.id });

        const source = inserted[0];
        if (source === undefined) {
          return { reason: null, duplicate: true, eventId: identity.eventId };
        }

        /*
         * `CHANGED` is NOT written here. `lineup_observations_status_check`
         * (packages/database/src/schema/intelligence.ts) restricts this
         * column to 'EXPECTED' | 'OFFICIAL' | 'UNAVAILABLE' at the database
         * level -- writing "CHANGED" would fail that constraint on every
         * insert, silently dropping the row into LINEUP_WRITE_FAILED. Making
         * CHANGED a real, storable status needs a migration widening that
         * check constraint, which needs the production database credential
         * P0-F is already blocked on. Detecting "this replaces an OFFICIAL
         * sheet" is left to a reader (e.g. `deriveLineupState`, once it wants
         * that distinction) by comparing this row's `receivedAt` against the
         * previous OFFICIAL row for the same event+team, not to the writer.
         */
        await transaction
          .insert(lineupObservations)
          .values({
            sourceObservationId: source.id,
            eventId: identity.eventId,
            teamParticipantId: team.participantId,
            schemaVersion: "api-sports.v1",
            status: lineup.status,
            /*
             * No confidence value. API-Sports does not say how likely a sheet
             * is to be the one that starts -- it either publishes the
             * confirmed eleven or it does not -- so a number here would be
             * invented evidence. The column is nullable for exactly this.
             */
            confidence: null,
            players: [...lineup.players],
            formation: lineup.formation,
            providerObservedAt: new Date(lineup.providerObservedAt),
            receivedAt: new Date(lineup.providerObservedAt),
          })
          .onConflictDoNothing({
            target: [
              lineupObservations.sourceObservationId,
              lineupObservations.eventId,
              lineupObservations.teamParticipantId,
            ],
          });

        return { reason: null, duplicate: false, eventId: identity.eventId };
      });

      if (outcome.reason) {
        bump(skippedByReason, outcome.reason);
        continue;
      }
      if (outcome.duplicate) {
        duplicate += 1;
        continue;
      }
      written += 1;
      eventIdsWithNewObservations.add(outcome.eventId);
    } catch (error) {
      /* One team's sheet failing must not discard the other's. */
      bump(
        skippedByReason,
        error instanceof Error && error.message.startsWith("LINEUP_")
          ? error.message
          : "LINEUP_WRITE_FAILED",
      );
    }
  }

  for (const [providerFixtureId, status] of weakestByFixture) {
    statusByProviderFixtureId[providerFixtureId] = status;
  }

  return {
    received: input.lineups.length,
    written,
    duplicate,
    /*
     * A fixture is official only when its weakest sheet is complete. Counting
     * per lineup row would report a fixture answered as soon as one team's
     * eleven arrived, and the gate would clear on half a match.
     */
    official: [...weakestByFixture.values()].filter(
      (status) => status === "OFFICIAL",
    ).length,
    skippedByReason,
    statusByProviderFixtureId,
    eventIdsWithNewObservations: [...eventIdsWithNewObservations],
  };
}

/** Re-exported so the gate's threshold has one definition. */
export { STARTING_ELEVEN };
