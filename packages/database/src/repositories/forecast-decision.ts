import { and, desc, eq, lte } from "drizzle-orm";

import type {
  PrivilegedVelyqDatabase,
  RepositoryTransaction,
} from "../client.js";
import { decisions, forecasts } from "../schema/intelligence.js";
import { oddsObservations } from "../schema/market.js";

export type AppendForecastInput = Readonly<{
  id?: string;
  predictionId: string;
  eventMarketOutcomeId: string;
  probability: string;
  confidence?: string | null;
  modelVersion: string;
  featureCutoff: Date;
  createdAt?: Date;
}>;

export type PersistedForecast = typeof forecasts.$inferSelect;

/**
 * Append-only forecast writer.
 *
 * `forecasts_prediction_id_unique` (see schema/intelligence.ts) is the real
 * idempotency boundary: one forecast per prediction, forever. A prediction
 * is itself already idempotent per `(predictionRunId, eventMarketOutcomeId)`
 * (see predictions.ts), so calling this twice for the same prediction -- the
 * same cycle re-run against unchanged inputs -- returns the existing row
 * rather than erroring or duplicating. A genuinely new model output gets a
 * new prediction row first (different run/model version), which is what
 * produces a new forecast here, never an update to this one.
 */
export class DatabaseForecastRepository {
  constructor(private readonly database: PrivilegedVelyqDatabase) {}

  async append(input: AppendForecastInput): Promise<PersistedForecast> {
    return this.database.transaction((transaction) =>
      this.appendInTransaction(transaction, input),
    );
  }

  async appendInTransaction(
    transaction: RepositoryTransaction,
    input: AppendForecastInput,
  ): Promise<PersistedForecast> {
    const inserted = await transaction
      .insert(forecasts)
      .values({
        ...(input.id ? { id: input.id } : {}),
        predictionId: input.predictionId,
        eventMarketOutcomeId: input.eventMarketOutcomeId,
        probability: input.probability,
        confidence: input.confidence ?? null,
        modelVersion: input.modelVersion,
        featureCutoff: input.featureCutoff,
        ...(input.createdAt ? { createdAt: input.createdAt } : {}),
      })
      .onConflictDoNothing({ target: forecasts.predictionId })
      .returning();

    const persisted =
      inserted[0] ??
      (await this.findByPredictionId(transaction, input.predictionId));
    if (!persisted) throw new Error("FORECAST_INSERT_FAILED");
    return persisted;
  }

  async getByPredictionId(
    predictionId: string,
  ): Promise<PersistedForecast | null> {
    return this.findByPredictionId(this.database, predictionId);
  }

  private async findByPredictionId(
    database: Pick<RepositoryTransaction, "select">,
    predictionId: string,
  ): Promise<PersistedForecast | null> {
    const [row] = await database
      .select()
      .from(forecasts)
      .where(eq(forecasts.predictionId, predictionId))
      .limit(1);
    return row ?? null;
  }
}

export type AppendDecisionInput = Readonly<{
  id?: string;
  forecastId: string;
  eventMarketOutcomeId: string;
  marketPriceObservationId?: string | null;
  status:
    | "STRONG_EDGE"
    | "NO_BET"
    | "WAIT"
    | "WAIT_FOR_LINEUP"
    | "INSUFFICIENT_DATA"
    | "EDGE_DISAPPEARED";
  selection: string;
  offeredOdds?: string | null;
  fairOdds?: string | null;
  expectedValue?: string | null;
  whyNotCodes: readonly string[];
  decisionSnapshot: Record<string, unknown>;
  createdAt?: Date;
}>;

export type PersistedDecision = typeof decisions.$inferSelect;

/**
 * Append-only, immutable decision writer.
 *
 * A decision has no unique constraint on `(forecastId, marketPriceObservationId)`
 * in the schema -- correctly so: a new decision for the same forecast at a
 * new price is a genuinely new decision (the odds changed, so did the
 * verdict at that instant), not a duplicate. Idempotency here therefore
 * means something narrower than the forecast/prediction case: calling this
 * twice with the exact same logical snapshot (same forecast, same price
 * observation, same status) must not create two rows. That is checked by
 * content, not by an unrelated database constraint, because there is
 * nothing else a caller could key on that wouldn't also block a legitimate
 * re-evaluation at a new price.
 */
export class DatabaseDecisionRepository {
  constructor(private readonly database: PrivilegedVelyqDatabase) {}

  async append(input: AppendDecisionInput): Promise<PersistedDecision> {
    return this.database.transaction((transaction) =>
      this.appendInTransaction(transaction, input),
    );
  }

  async appendInTransaction(
    transaction: RepositoryTransaction,
    input: AppendDecisionInput,
  ): Promise<PersistedDecision> {
    const existing = await this.findIdenticalLogicalDecision(
      transaction,
      input,
    );
    if (existing) return existing;

    const [inserted] = await transaction
      .insert(decisions)
      .values({
        ...(input.id ? { id: input.id } : {}),
        forecastId: input.forecastId,
        eventMarketOutcomeId: input.eventMarketOutcomeId,
        marketPriceObservationId: input.marketPriceObservationId ?? null,
        status: input.status,
        selection: input.selection,
        offeredOdds: input.offeredOdds ?? null,
        fairOdds: input.fairOdds ?? null,
        expectedValue: input.expectedValue ?? null,
        whyNotCodes: [...input.whyNotCodes],
        decisionSnapshot: input.decisionSnapshot,
        ...(input.createdAt ? { createdAt: input.createdAt } : {}),
      })
      .returning();
    if (!inserted) throw new Error("DECISION_INSERT_FAILED");
    return inserted;
  }

  async getLatestForForecast(
    forecastId: string,
  ): Promise<PersistedDecision | null> {
    const [row] = await this.database
      .select()
      .from(decisions)
      .where(eq(decisions.forecastId, forecastId))
      .orderBy(desc(decisions.createdAt))
      .limit(1);
    return row ?? null;
  }

  private async findIdenticalLogicalDecision(
    database: Pick<RepositoryTransaction, "select">,
    input: AppendDecisionInput,
  ): Promise<PersistedDecision | null> {
    const rows = await database
      .select()
      .from(decisions)
      .where(eq(decisions.forecastId, input.forecastId))
      .orderBy(desc(decisions.createdAt));

    return (
      rows.find(
        (row) =>
          row.status === input.status &&
          row.selection === input.selection &&
          (row.marketPriceObservationId ?? null) ===
            (input.marketPriceObservationId ?? null),
      ) ?? null
    );
  }
}

export type FreshestOddsObservation = Readonly<{
  id: string;
  eventMarketOutcomeId: string;
  bookmakerId: string;
  decimalOdds: string;
  providerObservedAt: string;
}>;

/**
 * Reads the freshest semantically valid odds observation for one outcome as
 * of a cutoff, across all bookmakers -- ordered by `providerObservedAt`
 * (when the market actually held that price), never by `receivedAt` or
 * insertion order, so a payload that arrives late but was observed earlier
 * cannot beat a genuinely fresher one, and a same-time race is broken
 * deterministically by id rather than by whichever insert happened to run
 * last. Only `ACTIVE`, non-synthetic observations both observed and received
 * at or before the cutoff are eligible -- a suspended or removed price is not
 * a valid current price, and neither post-kickoff evidence nor evidence that
 * was unavailable at decision time may be selected. That is why the cutoff
 * is a required parameter, not implicit "now".
 */
export class DatabaseFreshestOddsReader {
  constructor(private readonly database: PrivilegedVelyqDatabase) {}

  async getFreshestValidOdds(
    eventMarketOutcomeId: string,
    asOf: Date,
  ): Promise<FreshestOddsObservation | null> {
    const [row] = await this.database
      .select({
        id: oddsObservations.id,
        eventMarketOutcomeId: oddsObservations.eventMarketOutcomeId,
        bookmakerId: oddsObservations.bookmakerId,
        decimalOdds: oddsObservations.decimalOdds,
        providerObservedAt: oddsObservations.providerObservedAt,
      })
      .from(oddsObservations)
      .where(
        and(
          eq(oddsObservations.eventMarketOutcomeId, eventMarketOutcomeId),
          eq(oddsObservations.status, "ACTIVE"),
          eq(oddsObservations.isSynthetic, false),
          lte(oddsObservations.providerObservedAt, asOf),
          lte(oddsObservations.receivedAt, asOf),
        ),
      )
      .orderBy(
        desc(oddsObservations.providerObservedAt),
        desc(oddsObservations.id),
      )
      .limit(1);

    return row
      ? { ...row, providerObservedAt: row.providerObservedAt.toISOString() }
      : null;
  }

  async getAllValidObservations(
    eventMarketOutcomeId: string,
    asOf: Date,
  ): Promise<readonly FreshestOddsObservation[]> {
    const rows = await this.database
      .select({
        id: oddsObservations.id,
        eventMarketOutcomeId: oddsObservations.eventMarketOutcomeId,
        bookmakerId: oddsObservations.bookmakerId,
        decimalOdds: oddsObservations.decimalOdds,
        providerObservedAt: oddsObservations.providerObservedAt,
      })
      .from(oddsObservations)
      .where(
        and(
          eq(oddsObservations.eventMarketOutcomeId, eventMarketOutcomeId),
          eq(oddsObservations.status, "ACTIVE"),
          eq(oddsObservations.isSynthetic, false),
          lte(oddsObservations.providerObservedAt, asOf),
          lte(oddsObservations.receivedAt, asOf),
        ),
      )
      .orderBy(desc(oddsObservations.providerObservedAt));

    return rows.map((row) => ({
      ...row,
      providerObservedAt: row.providerObservedAt.toISOString(),
    }));
  }
}
