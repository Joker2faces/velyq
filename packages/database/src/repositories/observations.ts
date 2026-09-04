import type {
  NormalizedLineupObservation,
  NormalizedOddsObservation,
} from "@velyq/contracts";
import type {
  PrivilegedVelyqDatabase,
  RepositoryTransaction,
} from "../client.js";
import { lineupObservations } from "../schema/intelligence.js";
import { oddsObservations } from "../schema/market.js";
import { sourceObservations } from "../schema/operations.js";
import { and, eq } from "drizzle-orm";

type SourceInput = Readonly<{
  id?: string;
  providerId: string;
  syncRunId: string;
  observationType: string;
  providerExternalId: string;
  observation: Readonly<{
    provenance: Readonly<{
      providerObservedAt: string;
      receivedAt: string;
      normalizedAt: string;
      normalizationVersion: string;
      mappingVersion: string;
      sourceObservationHash: string;
    }>;
  }>;
}>;

/** Append-only provenance persistence. Existing hashes are returned, never overwritten. */
export class SourceObservationRepository {
  constructor(private readonly database: PrivilegedVelyqDatabase) {}

  async append(input: SourceInput) {
    return this.appendInTransaction(this.database, input);
  }

  async appendInTransaction(
    database: PrivilegedVelyqDatabase | RepositoryTransaction,
    input: SourceInput,
  ) {
    const value = {
      ...(input.id ? { id: input.id } : {}),
      providerId: input.providerId,
      syncRunId: input.syncRunId,
      observationType: input.observationType,
      providerExternalId: input.providerExternalId,
      providerObservedAt: new Date(
        input.observation.provenance.providerObservedAt,
      ),
      receivedAt: new Date(input.observation.provenance.receivedAt),
      normalizedAt: new Date(input.observation.provenance.normalizedAt),
      normalizationVersion: input.observation.provenance.normalizationVersion,
      mappingVersion: input.observation.provenance.mappingVersion,
      contentHash: input.observation.provenance.sourceObservationHash,
    };
    const inserted = await database
      .insert(sourceObservations)
      .values(value)
      .onConflictDoNothing({
        target: [
          sourceObservations.providerId,
          sourceObservations.observationType,
          sourceObservations.contentHash,
        ],
      })
      .returning();
    if (inserted[0]) return { row: inserted[0], duplicate: false } as const;
    const existing = await database.query.sourceObservations.findFirst({
      where: and(
        eq(sourceObservations.providerId, input.providerId),
        eq(sourceObservations.observationType, input.observationType),
        eq(
          sourceObservations.contentHash,
          input.observation.provenance.sourceObservationHash,
        ),
      ),
    });
    if (!existing)
      throw new Error("SOURCE_OBSERVATION_IDEMPOTENCY_LOOKUP_FAILED");
    return { row: existing, duplicate: true } as const;
  }
}

export type OddsObservationInput = Readonly<{
  sourceObservationId: string;
  eventMarketOutcomeId: string;
  bookmakerId: string;
  observation: NormalizedOddsObservation;
}>;

export class OddsObservationRepository {
  constructor(private readonly database: PrivilegedVelyqDatabase) {}

  async append(input: OddsObservationInput) {
    return this.appendInTransaction(this.database, input);
  }

  async appendInTransaction(
    database: PrivilegedVelyqDatabase | RepositoryTransaction,
    input: OddsObservationInput,
  ) {
    const { observation } = input;
    const inserted = await database
      .insert(oddsObservations)
      .values({
        sourceObservationId: input.sourceObservationId,
        eventMarketOutcomeId: input.eventMarketOutcomeId,
        bookmakerId: input.bookmakerId,
        decimalOdds: observation.decimalOdds.value,
        providerObservedAt: new Date(observation.provenance.providerObservedAt),
        receivedAt: new Date(observation.provenance.receivedAt),
        normalizedAt: new Date(observation.provenance.normalizedAt),
        status: observation.status,
        isSynthetic: observation.isSynthetic,
      })
      .onConflictDoNothing({
        target: [
          oddsObservations.sourceObservationId,
          oddsObservations.eventMarketOutcomeId,
          oddsObservations.bookmakerId,
        ],
      })
      .returning();
    return { row: inserted[0] ?? null, duplicate: !inserted[0] } as const;
  }
}

export type LineupObservationInput = Readonly<{
  sourceObservationId: string;
  observation: NormalizedLineupObservation;
}>;

export class LineupObservationRepository {
  constructor(private readonly database: PrivilegedVelyqDatabase) {}

  async append(input: LineupObservationInput) {
    return this.appendInTransaction(this.database, input);
  }

  async appendInTransaction(
    database: PrivilegedVelyqDatabase | RepositoryTransaction,
    input: LineupObservationInput,
  ) {
    const { observation } = input;
    const inserted = await database
      .insert(lineupObservations)
      .values({
        sourceObservationId: input.sourceObservationId,
        eventId: observation.eventId,
        teamParticipantId: observation.teamId,
        schemaVersion: "synthetic-lineup.v1",
        status:
          observation.status === "MISSING" ? "UNAVAILABLE" : observation.status,
        confidence: observation.confidence.value,
        players: observation.players,
        formation: observation.formation,
        providerObservedAt: new Date(observation.provenance.providerObservedAt),
        receivedAt: new Date(observation.provenance.receivedAt),
      })
      .onConflictDoNothing({
        target: [
          lineupObservations.sourceObservationId,
          lineupObservations.eventId,
          lineupObservations.teamParticipantId,
        ],
      })
      .returning();
    return { row: inserted[0] ?? null, duplicate: !inserted[0] } as const;
  }
}
