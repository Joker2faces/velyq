import { and, eq, sql } from "drizzle-orm";
import {
  eventParticipants,
  participants,
  providerPolicyVersions,
  providerSyncRuns,
  providers,
  sourceObservations,
  appendLineupObservation,
  loadLineupCandidateEvents,
  loadLineupStates,
  recordLineupRequest,
  type PrivilegedVelyqDatabase,
} from "@velyq/database";
import type {
  ApiSportsClient,
  ProviderQuota,
} from "@velyq/providers/apisports";
import {
  fetchFixtureLineups,
  type NormalizedLineup,
} from "@velyq/providers/apisports-lineups";
import {
  planLineupRequests,
  type LineupCandidate,
  type LineupRequestDecision,
} from "@velyq/providers/lineup-schedule";
import { createHash } from "node:crypto";

/**
 * The lineup polling cycle.
 *
 * Separated from odds ingestion and from prediction because it is governed by
 * a different clock. Odds are worth refreshing on a fixed cadence; a starting
 * eleven is worth asking about only inside the ninety minutes before kickoff,
 * and then with increasing urgency. Running the three on one schedule would
 * either waste most of a hundred-request daily budget re-asking about
 * fixtures that are still a day out, or arrive too late to be of use.
 *
 * Everything here is bounded by that budget. The planner decides which
 * fixtures to ask about and refuses to spend more than its share of what the
 * provider has left, so a lineup cycle can never starve the odds cycle that
 * runs after it.
 */

const API_SPORTS = "API_SPORTS";
const SCHEMA_VERSION = "api-sports.lineups.v1";

export type LineupCycleResult = Readonly<{
  asOf: string;
  candidates: number;
  planned: number;
  requested: number;
  lineupsStored: number;
  quotaRemaining: number | null;
  skippedForQuota: number;
  decisions: Readonly<Record<string, number>>;
  /** Teams the provider named that no stored participant matched. */
  unresolvedTeams: readonly string[];
}>;

export type LineupCycleOptions = Readonly<{
  database: PrivilegedVelyqDatabase;
  client: ApiSportsClient;
  asOf?: Date;
  horizonHours?: number;
  maxRequests?: number;
  /** When false, the plan is computed and reported but nothing is fetched. */
  commit?: boolean;
}>;

/**
 * The horizon the planner sees.
 *
 * Wider than the polling window on purpose: the planner needs to know a
 * fixture exists in order to report why it is being skipped, and a candidate
 * list that only contained fixtures already inside the window would make
 * "nothing to do" and "nothing scheduled" indistinguishable.
 */
const DEFAULT_HORIZON_HOURS = 12;

export async function runLineupCycle(
  options: LineupCycleOptions,
): Promise<LineupCycleResult> {
  const asOf = options.asOf ?? new Date();
  const commit = options.commit ?? true;
  const events = await loadLineupCandidateEvents(
    options.database,
    asOf,
    options.horizonHours ?? DEFAULT_HORIZON_HOURS,
  );
  const states = await loadLineupStates(
    options.database,
    events.map((event) => event.eventId),
  );

  const candidates: LineupCandidate[] = events.map((event) => {
    const state = states.get(event.eventId);
    return {
      eventId: event.eventId,
      providerFixtureId: event.providerFixtureId,
      kickoffAt: event.kickoffAt,
      lineupsCovered: state?.lineupsCovered ?? null,
      lineupAvailable: state?.availability === "LINEUP_AVAILABLE",
      lastCheckedAt: state?.lastCheckedAt ?? null,
    };
  });

  /*
   * The provider's own remaining budget, read from the last response rather
   * than counted locally. A local tally is wrong the moment anything else
   * shares the key, and on a free plan something usually does.
   */
  const quota = await lastKnownQuota(options.client);
  const plan = planLineupRequests(candidates, quota, asOf, {
    ...(options.maxRequests === undefined
      ? {}
      : { maxRequests: options.maxRequests }),
  });

  const decisions: Record<string, number> = {};
  for (const entry of plan.entries)
    decisions[entry.decision] = (decisions[entry.decision] ?? 0) + 1;

  if (!commit || plan.requests.length === 0)
    return {
      asOf: asOf.toISOString(),
      candidates: candidates.length,
      planned: plan.requests.length,
      requested: 0,
      lineupsStored: 0,
      quotaRemaining: quota.requestsRemaining,
      skippedForQuota: plan.skippedForQuota,
      decisions,
      unresolvedTeams: [],
    };

  const runId = await openSyncRun(options.database, asOf);
  let requested = 0;
  let stored = 0;
  let remaining = quota.requestsRemaining;
  const unresolved = new Set<string>();

  for (const entry of plan.requests) {
    const fetched = await fetchFixtureLineups(
      options.client,
      entry.providerFixtureId,
    );
    requested += 1;
    remaining = fetched.quota.requestsRemaining;

    await recordLineupRequest(options.database, {
      eventId: entry.eventId,
      providerFixtureId: entry.providerFixtureId,
      availability: fetched.availability,
      minutesToKickoff: entry.minutesToKickoff,
      pollWindow: entry.window,
      teamsReturned: fetched.lineups.length,
      requestedAt: new Date(),
    });

    for (const lineup of fetched.lineups) {
      const teamId = await resolveTeam(
        options.database,
        entry.eventId,
        lineup.teamName,
      );
      if (teamId === null) {
        /*
         * Reported, never guessed. Attaching an XI to the wrong side of a
         * fixture is worse than having no XI: the decision policy would read
         * it as confirmed evidence and grade on it.
         */
        unresolved.add(lineup.teamName);
        continue;
      }
      const observationId = await appendSourceObservation(
        options.database,
        runId,
        lineup,
        asOf,
      );
      if (observationId === null) continue;
      const inserted = await appendLineupObservation(options.database, {
        eventId: entry.eventId,
        providerFixtureId: lineup.providerFixtureId,
        teamParticipantId: teamId,
        formation: lineup.formation,
        coachName: lineup.coachName,
        providerCoachId: lineup.providerCoachId,
        starters: lineup.starters,
        substitutes: lineup.substitutes,
        players: lineup.players,
        sourceObservationId: observationId,
        observedAt: asOf,
      });
      if (inserted) stored += 1;
    }
  }

  await closeSyncRun(options.database, runId, requested, stored);

  return {
    asOf: asOf.toISOString(),
    candidates: candidates.length,
    planned: plan.requests.length,
    requested,
    lineupsStored: stored,
    quotaRemaining: remaining,
    skippedForQuota: plan.skippedForQuota,
    decisions,
    unresolvedTeams: [...unresolved].sort(),
  };
}

/** Decisions the planner can return, re-exported so callers can total them. */
export type { LineupRequestDecision };

/**
 * Reads the provider's remaining daily budget with a single status call.
 *
 * One request to learn how many are left is a real cost on a hundred-request
 * plan, and it is still the right trade: planning against a stale or assumed
 * budget is how a cycle spends its last twenty calls in one burst and leaves
 * the evening's fixtures unpolled.
 */
async function lastKnownQuota(client: ApiSportsClient): Promise<ProviderQuota> {
  const response = await client.get("/status", {});
  return response.quota;
}

async function resolveTeam(
  database: PrivilegedVelyqDatabase,
  eventId: string,
  teamName: string,
): Promise<string | null> {
  const rows = await database
    .select({ id: participants.id, displayName: participants.displayName })
    .from(eventParticipants)
    .innerJoin(
      participants,
      eq(eventParticipants.participantId, participants.id),
    )
    .where(eq(eventParticipants.eventId, eventId));
  const normalized = teamName.trim().toLowerCase();
  const match = rows.find(
    (row) => row.displayName.trim().toLowerCase() === normalized,
  );
  return match?.id ?? null;
}

async function openSyncRun(
  database: PrivilegedVelyqDatabase,
  asOf: Date,
): Promise<string> {
  const [provider] = await database
    .select({ id: providers.id })
    .from(providers)
    .where(eq(providers.code, API_SPORTS))
    .limit(1);
  if (!provider) throw new Error("API_SPORTS_PROVIDER_NOT_REGISTERED");
  const [policy] = await database
    .select({ id: providerPolicyVersions.id })
    .from(providerPolicyVersions)
    .where(eq(providerPolicyVersions.providerId, provider.id))
    .limit(1);
  if (!policy) throw new Error("API_SPORTS_POLICY_VERSION_NOT_REGISTERED");

  const [run] = await database
    .insert(providerSyncRuns)
    .values({
      providerId: provider.id,
      capability: "FOOTBALL_LINEUPS",
      status: "RUNNING",
      providerSchemaVersion: SCHEMA_VERSION,
      normalizationVersion: SCHEMA_VERSION,
      mappingVersion: SCHEMA_VERSION,
      policyVersionId: policy.id,
      startedAt: asOf,
    })
    .returning({ id: providerSyncRuns.id });
  if (!run) throw new Error("LINEUP_SYNC_RUN_NOT_CREATED");
  return run.id;
}

async function closeSyncRun(
  database: PrivilegedVelyqDatabase,
  runId: string,
  received: number,
  accepted: number,
): Promise<void> {
  await database
    .update(providerSyncRuns)
    .set({
      status: "COMPLETED",
      completedAt: new Date(),
      receivedCount: received,
      acceptedCount: accepted,
      rejectedCount: Math.max(0, received - accepted),
    })
    .where(eq(providerSyncRuns.id, runId));
}

/**
 * The provenance row a lineup observation points at.
 *
 * Content-hashed over the normalized lineup, so re-fetching an unchanged XI
 * resolves to the same observation and the append-only lineup table gains
 * nothing; a genuine change — a late injury, a corrected sheet — hashes
 * differently and is stored as a new version alongside the old one.
 */
async function appendSourceObservation(
  database: PrivilegedVelyqDatabase,
  runId: string,
  lineup: NormalizedLineup,
  asOf: Date,
): Promise<string | null> {
  const [provider] = await database
    .select({ id: providers.id })
    .from(providers)
    .where(eq(providers.code, API_SPORTS))
    .limit(1);
  if (!provider) return null;
  const contentHash = `sha256:${createHash("sha256")
    .update(JSON.stringify(lineup))
    .digest("hex")}`;
  const [row] = await database
    .insert(sourceObservations)
    .values({
      providerId: provider.id,
      syncRunId: runId,
      observationType: "LINEUP",
      providerExternalId: `${lineup.providerFixtureId}:${lineup.providerTeamId ?? lineup.teamName}`,
      providerObservedAt: asOf,
      receivedAt: asOf,
      normalizedAt: asOf,
      normalizationVersion: SCHEMA_VERSION,
      mappingVersion: SCHEMA_VERSION,
      contentHash,
    })
    .onConflictDoNothing()
    .returning({ id: sourceObservations.id });
  if (row) return row.id;

  /*
   * The insert conflicted, which means this exact lineup has been seen
   * before. The existing row is the right one to point at — a second
   * observation of identical content is not new evidence.
   */
  const [existing] = await database
    .select({ id: sourceObservations.id })
    .from(sourceObservations)
    .where(
      and(
        eq(sourceObservations.providerId, provider.id),
        eq(sourceObservations.contentHash, contentHash),
      ),
    )
    .orderBy(sql`${sourceObservations.receivedAt} desc`)
    .limit(1);
  return existing?.id ?? null;
}
