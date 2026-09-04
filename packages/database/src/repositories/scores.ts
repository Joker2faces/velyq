import { and, desc, eq, lte } from "drizzle-orm";
import type {
  PrivilegedVelyqDatabase,
  RepositoryTransaction,
} from "../client.js";
import { radarEvidence, scoreResults } from "../schema/intelligence.js";

export type PersistScoreInput = Readonly<{
  scoreDefinitionVersionId: string;
  predictionId?: string | null;
  eventMarketOutcomeId: string;
  dataQualityAssessmentId: string;
  asOf: Date;
  score: string;
  components: Record<string, unknown>;
  weights: Record<string, unknown>;
  capsPenalties: Record<string, unknown>;
  reasonCodes: readonly string[];
  idempotencyKey: string;
  createdAt: Date;
}>;

export type PersistRadarEvidenceInput = Readonly<{
  scoreResultId: string;
  openingObservationId: string;
  currentObservationId: string;
  supportingObservationIds: readonly string[];
  bookmakersObserved: number;
  bookmakersMoving: number;
  movementWindowSeconds: number;
  observableMetrics: Record<string, unknown>;
}>;

/** Append-only score and observable RADAR evidence persistence. */
export class DatabaseScoreRepository {
  constructor(private readonly database: PrivilegedVelyqDatabase) {}

  async append(input: PersistScoreInput) {
    return this.database.transaction((transaction) =>
      this.appendInTransaction(transaction, input),
    );
  }

  async appendInTransaction(
    transaction: RepositoryTransaction,
    input: PersistScoreInput,
  ) {
    const [row] = await transaction
      .insert(scoreResults)
      .values({
        scoreDefinitionVersionId: input.scoreDefinitionVersionId,
        predictionId: input.predictionId ?? null,
        eventMarketOutcomeId: input.eventMarketOutcomeId,
        dataQualityAssessmentId: input.dataQualityAssessmentId,
        asOf: input.asOf,
        score: input.score,
        components: input.components,
        weights: input.weights,
        capsPenalties: input.capsPenalties,
        reasonCodes: [...input.reasonCodes],
        idempotencyKey: input.idempotencyKey,
        createdAt: input.createdAt,
      })
      .onConflictDoNothing({ target: scoreResults.idempotencyKey })
      .returning();
    if (row) return row;
    const [existing] = await transaction
      .select()
      .from(scoreResults)
      .where(eq(scoreResults.idempotencyKey, input.idempotencyKey))
      .limit(1);
    if (!existing) throw new Error("SCORE_RESULT_INSERT_FAILED");
    return existing;
  }

  async appendRadarEvidence(input: PersistRadarEvidenceInput) {
    const [row] = await this.database
      .insert(radarEvidence)
      .values({
        scoreResultId: input.scoreResultId,
        openingObservationId: input.openingObservationId,
        currentObservationId: input.currentObservationId,
        supportingObservationIds: [...input.supportingObservationIds],
        bookmakersObserved: input.bookmakersObserved,
        bookmakersMoving: input.bookmakersMoving,
        movementWindowSeconds: input.movementWindowSeconds,
        observableMetrics: input.observableMetrics,
      })
      .returning();
    if (!row) throw new Error("RADAR_EVIDENCE_INSERT_FAILED");
    return row;
  }

  async appendWithRadarEvidence(
    input: PersistScoreInput,
    evidence: Omit<PersistRadarEvidenceInput, "scoreResultId">,
  ) {
    return this.database.transaction(async (transaction) => {
      const score = await this.appendInTransaction(transaction, input);
      const [radar] = await transaction
        .insert(radarEvidence)
        .values({
          scoreResultId: score.id,
          ...evidence,
          supportingObservationIds: [...evidence.supportingObservationIds],
        })
        .onConflictDoNothing({ target: radarEvidence.scoreResultId })
        .returning();
      return { score, radar: radar ?? null };
    });
  }

  async getLatestAsOf(eventMarketOutcomeId: string, asOf: Date) {
    const rows = await this.database
      .select()
      .from(scoreResults)
      .where(
        and(
          eq(scoreResults.eventMarketOutcomeId, eventMarketOutcomeId),
          lte(scoreResults.asOf, asOf),
        ),
      )
      .orderBy(
        desc(scoreResults.asOf),
        desc(scoreResults.createdAt),
        desc(scoreResults.id),
      )
      .limit(1);
    return rows[0] ?? null;
  }
}
