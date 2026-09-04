import {
  assessDataQuality,
  calculateValue,
  calculateEdge,
  calculateRadar,
  decideRecommendation,
  type DataQualityAssessment,
  type QualityInput,
  type HeuristicFormula,
} from "@velyq/analytics";
import {
  addDecimalStrings,
  divideDecimalStrings,
  subtractDecimalStrings,
  type DecimalString,
} from "@velyq/decimal";
import { and, eq, lte } from "drizzle-orm";
import {
  DatabaseJobRepository,
  DatabasePredictionObservationReader,
  DatabasePredictionRepository,
  DatabaseQualityRepository,
  DatabaseScoreRepository,
  type PrivilegedVelyqDatabase,
  calibrationVersions,
  dataQualityAssessments,
  modelVersions,
  oddsObservations,
  predictions,
  scoreDefinitionVersions,
} from "@velyq/database";
import {
  validateJob,
  type Job,
  type CalculateEdgePayload,
  type CalculateRadarPayload,
  type RecommendationStatus,
} from "@velyq/contracts";

export type PredictionJob = Readonly<{
  id: string;
  idempotencyKey: string;
  createdAt: string;
  correlationId: string;
  causationId: string;
  payload: PredictionInput;
}>;

export type PredictionInput = Readonly<{
  eventId: string;
  eventMarketOutcomeId: string;
  modelProbability: DecimalString;
  currentOdds: DecimalString;
  quality: QualityInput;
  featureCutoff: string;
  modelVersion: string;
  calibrationVersion: string;
  sourceObservationIds: readonly string[];
}>;

export type PredictionTrace = Readonly<{
  triggerJobId: string;
  correlationId: string;
  causationId: string;
  featureCutoff: string;
  modelVersion: string;
  calibrationVersion: string;
  sourceObservationIds: readonly string[];
}>;

export type PredictionRecord = Readonly<{
  id: string;
  eventId: string;
  eventMarketOutcomeId: string;
  decisionStatus: RecommendationStatus;
  quality: DataQualityAssessment;
  modelProbability: DecimalString | null;
  confidence: DecimalString | null;
  fairOdds: DecimalString | null;
  marketImpliedProbability: DecimalString | null;
  edge: DecimalString | null;
  expectedValue: DecimalString | null;
  reasonCodes: readonly string[];
  trace: PredictionTrace;
  createdAt: string;
}>;

export type PredictionJobResult = Readonly<{
  prediction: PredictionRecord;
  duplicate: boolean;
}>;

export interface PredictionRepository {
  getByIdempotencyKey(idempotencyKey: string): PredictionRecord | undefined;
  save(idempotencyKey: string, prediction: PredictionRecord): PredictionRecord;
}

export type PredictionObservation = Readonly<{
  id: string;
  eventId: string;
  eventMarketOutcomeId: string;
  receivedAt: string;
  decimalOdds?: DecimalString;
}>;

export interface PredictionObservationReader {
  getByIds(ids: readonly string[]): Promise<readonly PredictionObservation[]>;
}

export type PredictionQueueLease = Readonly<{
  job: Job;
  leaseExpiresAt: string;
}>;

/** Minimal durable queue port used by the worker composition root. */
export interface PredictionJobQueue {
  leaseNext(
    workerId: string,
    now: Date,
    leaseUntil: Date,
  ): Promise<PredictionQueueLease | null>;
  complete(jobId: string, workerId: string, completedAt: Date): Promise<Job>;
  fail(
    jobId: string,
    workerId: string,
    error: Readonly<{ code: string; message: string }>,
    failedAt: Date,
  ): Promise<Job>;
}

export type PredictionWorkerResult = Readonly<{
  leased: boolean;
  status: "COMPLETED" | "FAILED" | "IDLE";
  jobId: string | null;
  errorCode?: string;
}>;

/** Durable production handler: calculates from persisted lineage and appends the result transactionally. */
export class DatabasePredictionJobHandler {
  private readonly observations: DatabasePredictionObservationReader;
  private readonly predictions: DatabasePredictionRepository;
  private readonly quality: DatabaseQualityRepository;

  constructor(private readonly database: PrivilegedVelyqDatabase) {
    this.observations = new DatabasePredictionObservationReader(database);
    this.predictions = new DatabasePredictionRepository(database);
    this.quality = new DatabaseQualityRepository(database);
  }

  async handle(job: Job): Promise<void> {
    const validation = validateJob(job);
    if (!validation.ok || job.type !== "GENERATE_PREDICTION")
      throw new Error("INVALID_GENERATE_PREDICTION_JOB");
    const payload = job.payload as PredictionInput;
    const observations = await this.observations.getByIds(
      payload.sourceObservationIds,
    );
    if (observations.length !== payload.sourceObservationIds.length)
      throw new Error("PREDICTION_INPUTS_MISSING");
    const cutoff = Date.parse(payload.featureCutoff);
    if (
      observations.some(
        (observation) =>
          observation.eventId !== payload.eventId ||
          observation.eventMarketOutcomeId !== payload.eventMarketOutcomeId ||
          Date.parse(observation.receivedAt) > cutoff ||
          !observation.decimalOdds,
      )
    )
      throw new Error("PREDICTION_INPUTS_OUTSIDE_CUTOFF");
    const latestOdds = [...observations].sort((left, right) =>
      right.receivedAt.localeCompare(left.receivedAt),
    )[0]?.decimalOdds;
    if (!latestOdds) throw new Error("PREDICTION_ODDS_MISSING");
    const durablePayload = {
      ...payload,
      currentOdds: latestOdds as DecimalString,
    };
    const computed = generatePrediction(
      {
        id: job.id,
        idempotencyKey: job.idempotencyKey,
        createdAt: job.createdAt,
        correlationId: job.correlationId,
        causationId: job.causationId,
        payload: durablePayload,
      },
      new InMemoryPredictionRepository(),
    ).prediction;
    const quality = await this.quality.getLatestAsOf(
      payload.eventId,
      new Date(payload.featureCutoff),
      payload.eventMarketOutcomeId,
    );
    if (!quality) throw new Error("QUALITY_ASSESSMENT_MISSING");
    const [model] = await this.database
      .select()
      .from(modelVersions)
      .where(eq(modelVersions.version, payload.modelVersion))
      .limit(1);
    const [calibration] = await this.database
      .select()
      .from(calibrationVersions)
      .where(
        and(
          eq(calibrationVersions.version, payload.calibrationVersion),
          model ? eq(calibrationVersions.modelVersionId, model.id) : undefined,
        ),
      )
      .limit(1);
    if (!model || !calibration) throw new Error("MODEL_CALIBRATION_MISSING");
    await this.predictions.append({
      run: {
        modelVersionId: model.id,
        calibrationVersionId: calibration.id,
        eventId: payload.eventId,
        featureCutoff: new Date(payload.featureCutoff),
        status: "COMPLETED",
        startedAt: new Date(job.createdAt),
        completedAt: new Date(job.createdAt),
        triggerJobId: job.id,
      },
      prediction: {
        eventMarketOutcomeId: computed.eventMarketOutcomeId,
        dataQualityAssessmentId: quality.id,
        marketPriceObservationId: null,
        decisionStatus: computed.decisionStatus,
        modelProbability: computed.modelProbability,
        confidence: computed.confidence,
        fairOdds: computed.fairOdds,
        marketImpliedProbability: computed.marketImpliedProbability,
        edge: computed.edge,
        expectedValue: computed.expectedValue,
        reasonCodes: computed.reasonCodes,
        structuredReasons: {
          quality: computed.quality,
          trace: computed.trace,
        },
        createdAt: new Date(computed.createdAt),
      },
      inputs: payload.sourceObservationIds.map((sourceObservationId) => ({
        sourceObservationId,
        inputRole: "ODDS",
        createdAt: new Date(job.createdAt),
      })),
    });
  }
}

export async function runDurablePredictionJobOnce(
  config: Readonly<{
    database: PrivilegedVelyqDatabase;
    workerId: string;
    now: Date;
    leaseDurationMs: number;
  }>,
): Promise<PredictionWorkerResult> {
  const queue = new DatabaseJobRepository(config.database);
  const lease = await queue.leaseNext(
    config.workerId,
    config.now,
    new Date(config.now.getTime() + config.leaseDurationMs),
  );
  if (!lease) return { leased: false, status: "IDLE", jobId: null };
  try {
    await new DatabasePredictionJobHandler(config.database).handle(lease.job);
    await queue.complete(lease.job.id, config.workerId, config.now);
    return { leased: true, status: "COMPLETED", jobId: lease.job.id };
  } catch (error) {
    const errorCode =
      error instanceof Error ? error.message : "PREDICTION_FAILED";
    await queue.fail(
      lease.job.id,
      config.workerId,
      { code: errorCode, message: "Prediction job processing failed." },
      config.now,
    );
    return { leased: true, status: "FAILED", jobId: lease.job.id, errorCode };
  }
}

/** Production composition root for every prediction-pipeline job type. */
export async function runDurablePipelineJobOnce(
  config: Readonly<{
    database: PrivilegedVelyqDatabase;
    workerId: string;
    now: Date;
    leaseDurationMs: number;
  }>,
): Promise<PredictionWorkerResult> {
  const queue = new DatabaseJobRepository(config.database);
  const lease = await queue.leaseNext(
    config.workerId,
    config.now,
    new Date(config.now.getTime() + config.leaseDurationMs),
  );
  if (!lease) return { leased: false, status: "IDLE", jobId: null };
  try {
    if (lease.job.type === "GENERATE_PREDICTION") {
      await new DatabasePredictionJobHandler(config.database).handle(lease.job);
    } else if (
      lease.job.type === "CALCULATE_EDGE" ||
      lease.job.type === "CALCULATE_RADAR"
    ) {
      const writer = new DatabaseScoreWriter(config.database);
      if (lease.job.type === "CALCULATE_EDGE")
        await consumeQueuedEdgeJob(
          lease.job,
          new DatabaseEdgeInputReader(config.database),
          writer,
        );
      else
        await consumeQueuedRadarJob(
          lease.job,
          new DatabaseRadarInputReader(config.database),
          writer,
        );
    } else {
      throw new Error("INVALID_PIPELINE_JOB_TYPE");
    }
    await queue.complete(lease.job.id, config.workerId, config.now);
    return { leased: true, status: "COMPLETED", jobId: lease.job.id };
  } catch (error) {
    const errorCode =
      error instanceof Error ? error.message : "PIPELINE_JOB_FAILED";
    await queue.fail(
      lease.job.id,
      config.workerId,
      { code: errorCode, message: "Pipeline job processing failed." },
      config.now,
    );
    return { leased: true, status: "FAILED", jobId: lease.job.id, errorCode };
  }
}

/**
 * Processes one durable queue lease. No in-memory repository is created here:
 * the composition root must provide the persistence implementation explicitly.
 */
export async function processPredictionJobOnce(
  queue: PredictionJobQueue,
  reader: PredictionObservationReader,
  repository: PredictionRepository,
  input: Readonly<{
    workerId: string;
    now: Date;
    leaseDurationMs: number;
  }>,
): Promise<PredictionWorkerResult> {
  const lease = await queue.leaseNext(
    input.workerId,
    input.now,
    new Date(input.now.getTime() + input.leaseDurationMs),
  );
  if (!lease) return { leased: false, status: "IDLE", jobId: null };

  try {
    await consumeQueuedPredictionJobWithInputs(lease.job, reader, repository);
    await queue.complete(lease.job.id, input.workerId, input.now);
    return { leased: true, status: "COMPLETED", jobId: lease.job.id };
  } catch (error) {
    const errorCode =
      error instanceof Error ? error.message : "PREDICTION_FAILED";
    await queue.fail(
      lease.job.id,
      input.workerId,
      { code: errorCode, message: "Prediction job processing failed." },
      input.now,
    );
    return { leased: true, status: "FAILED", jobId: lease.job.id, errorCode };
  }
}

export async function processScoreJobOnce(
  queue: PredictionJobQueue,
  edgeReader: EdgeInputReader,
  radarReader: RadarInputReader,
  writer: ScoreWriter,
  input: Readonly<{
    workerId: string;
    now: Date;
    leaseDurationMs: number;
  }>,
): Promise<PredictionWorkerResult> {
  const lease = await queue.leaseNext(
    input.workerId,
    input.now,
    new Date(input.now.getTime() + input.leaseDurationMs),
  );
  if (!lease) return { leased: false, status: "IDLE", jobId: null };
  try {
    if (lease.job.type === "CALCULATE_EDGE")
      await consumeQueuedEdgeJob(lease.job, edgeReader, writer);
    else if (lease.job.type === "CALCULATE_RADAR")
      await consumeQueuedRadarJob(lease.job, radarReader, writer);
    else throw new Error("INVALID_SCORE_JOB_TYPE");
    await queue.complete(lease.job.id, input.workerId, input.now);
    return { leased: true, status: "COMPLETED", jobId: lease.job.id };
  } catch (error) {
    const errorCode =
      error instanceof Error ? error.message : "SCORE_PROCESSING_FAILED";
    await queue.fail(
      lease.job.id,
      input.workerId,
      { code: errorCode, message: "Score job processing failed." },
      input.now,
    );
    return { leased: true, status: "FAILED", jobId: lease.job.id, errorCode };
  }
}

export type ScoreWriteInput = Readonly<{
  jobId: string;
  eventId: string;
  eventMarketOutcomeId: string;
  scoreDefinitionVersionId: string;
  asOf: string;
  score: DecimalString;
  predictionId?: string;
  validationStatus: "DEVELOPMENT_HEURISTIC";
  components: Readonly<Record<string, string>>;
  reasonCodes: readonly string[];
  radarEvidence?: Readonly<{
    openingObservationId: string;
    currentObservationId: string;
    openingOdds: DecimalString;
    currentOdds: DecimalString;
    bookmakersObserved: number;
    bookmakersMoving: number;
    movementWindowSeconds: number;
    supportingObservationIds?: readonly string[];
    consensus?: DecimalString;
    divergence?: DecimalString;
  }>;
}>;

export interface ScoreWriter {
  append(input: ScoreWriteInput): Promise<void>;
}

type ScoreDefinitionMetadata = Readonly<{
  weights: Record<string, DecimalString>;
  capsPenalties: Record<string, DecimalString>;
}>;

export function scoreDefinitionMetadata(
  definition: unknown,
): ScoreDefinitionMetadata {
  if (!definition || typeof definition !== "object") {
    throw new Error("INVALID_SCORE_DEFINITION_FORMULA");
  }
  const record = definition as Record<string, unknown>;
  const weights = record["weights"];
  const capsPenalties = record["capsPenalties"] ?? record["caps_penalties"];
  return {
    weights: safeDecimalRecord(weights),
    capsPenalties: safeDecimalRecord(capsPenalties),
  };
}

function safeDecimalRecord(value: unknown): Record<string, DecimalString> {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("INVALID_SCORE_DEFINITION_FORMULA");
  const output: Record<string, DecimalString> = {};
  for (const [key, candidate] of Object.entries(value)) {
    if (typeof candidate !== "string")
      throw new Error("INVALID_SCORE_DEFINITION_FORMULA");
    const checked = addDecimalStrings(
      "0" as DecimalString,
      candidate as DecimalString,
    );
    if (!checked.ok || candidate.startsWith("-"))
      throw new Error("INVALID_SCORE_DEFINITION_FORMULA");
    output[key] = checked.value;
  }
  return output;
}

function heuristicFormulaFromDefinition(definition: unknown): HeuristicFormula {
  const metadata = scoreDefinitionMetadata(definition);
  return {
    ...(Object.keys(metadata.weights).length > 0
      ? { weights: metadata.weights }
      : {}),
    ...(Object.keys(metadata.capsPenalties).length > 0
      ? { capsPenalties: metadata.capsPenalties }
      : {}),
  };
}

export interface EdgeInputReader {
  getInput(input: CalculateEdgePayload): Promise<Readonly<{
    probabilityEdge: DecimalString;
    expectedValue: DecimalString;
    qualityScore: DecimalString;
    formula?: HeuristicFormula;
  }> | null>;
}

export class DatabaseEdgeInputReader implements EdgeInputReader {
  constructor(private readonly database: PrivilegedVelyqDatabase) {}

  async getInput(input: CalculateEdgePayload) {
    const [row] = await this.database
      .select({ prediction: predictions, quality: dataQualityAssessments })
      .from(predictions)
      .innerJoin(
        dataQualityAssessments,
        eq(predictions.dataQualityAssessmentId, dataQualityAssessments.id),
      )
      .where(eq(predictions.id, input.predictionId))
      .limit(1);
    const [definition] = await this.database
      .select({
        definition: scoreDefinitionVersions.definition,
        scoreType: scoreDefinitionVersions.scoreType,
      })
      .from(scoreDefinitionVersions)
      .where(eq(scoreDefinitionVersions.id, input.scoreDefinitionVersionId))
      .limit(1);
    if (
      !row ||
      row.prediction.eventMarketOutcomeId !== input.eventMarketOutcomeId ||
      !row.prediction.edge ||
      !row.prediction.expectedValue
    )
      return null;
    const qualityScore = row.quality.numericScore as DecimalString;
    const normalizedQuality =
      qualityScore === "0" || qualityScore.startsWith("0.")
        ? ({ ok: true, value: qualityScore } as const)
        : divideDecimalStrings(qualityScore, "100" as DecimalString);
    if (!normalizedQuality.ok) return null;
    const formula = definition
      ? heuristicFormulaFromDefinition(definition.definition)
      : {};
    return {
      probabilityEdge: row.prediction.edge as DecimalString,
      expectedValue: row.prediction.expectedValue as DecimalString,
      qualityScore: normalizedQuality.value,
      formula,
    };
  }
}

export class DatabaseRadarInputReader implements RadarInputReader {
  constructor(private readonly database: PrivilegedVelyqDatabase) {}

  async getInput(input: CalculateRadarPayload) {
    const rows = await this.database
      .select()
      .from(oddsObservations)
      .where(
        and(
          eq(oddsObservations.eventMarketOutcomeId, input.eventMarketOutcomeId),
          lte(oddsObservations.providerObservedAt, new Date(input.asOf)),
          lte(oddsObservations.receivedAt, new Date(input.asOf)),
        ),
      );
    const opening = rows.find((row) => row.id === input.openingObservationId);
    const current = rows.find((row) => row.id === input.currentObservationId);
    if (!opening || !current) return null;
    const windowRows = rows.filter(
      (row) =>
        row.providerObservedAt >= opening.providerObservedAt &&
        row.providerObservedAt <= current.providerObservedAt,
    );
    const [definition] = await this.database
      .select({
        definition: scoreDefinitionVersions.definition,
        scoreType: scoreDefinitionVersions.scoreType,
      })
      .from(scoreDefinitionVersions)
      .where(eq(scoreDefinitionVersions.id, input.scoreDefinitionVersionId))
      .limit(1);
    if (definition?.scoreType !== "RADAR") return null;
    const formula = definition
      ? heuristicFormulaFromDefinition(definition.definition)
      : {};
    const byBookmaker = new Map<string, typeof rows>();
    for (const row of windowRows) {
      const group = byBookmaker.get(row.bookmakerId) ?? [];
      group.push(row);
      byBookmaker.set(row.bookmakerId, group);
    }
    const movingBookmakers = [...byBookmaker.values()].filter((group) => {
      const ordered = [...group].sort(
        (a, b) =>
          a.providerObservedAt.getTime() - b.providerObservedAt.getTime(),
      );
      const first = ordered[0];
      const last = ordered.at(-1);
      if (!first || !last) return false;
      const movement = subtractDecimalStrings(
        last.decimalOdds as DecimalString,
        first.decimalOdds as DecimalString,
      );
      return movement.ok && movement.value !== "0";
    }).length;
    const bookmakerCount = byBookmaker.size;
    const latestPrices = [...byBookmaker.values()]
      .map(
        (group) =>
          [...group]
            .sort(
              (a, b) =>
                a.providerObservedAt.getTime() - b.providerObservedAt.getTime(),
            )
            .at(-1)?.decimalOdds as DecimalString | undefined,
      )
      .filter((value): value is DecimalString => value !== undefined);
    let minimum = latestPrices[0];
    let maximum = latestPrices[0];
    for (const price of latestPrices.slice(1)) {
      if (!minimum || !maximum) break;
      const below = subtractDecimalStrings(price, minimum);
      const above = subtractDecimalStrings(price, maximum);
      if (below.ok && below.value.startsWith("-")) minimum = price;
      if (above.ok && !above.value.startsWith("-")) maximum = price;
    }
    const divergenceResult =
      minimum && maximum
        ? subtractDecimalStrings(maximum, minimum)
        : ({ ok: true, value: "0" as DecimalString } as const);
    if (!divergenceResult.ok) return null;
    const consensusResult = divideDecimalStrings(
      String(movingBookmakers) as DecimalString,
      String(bookmakerCount || 1) as DecimalString,
    );
    if (!consensusResult.ok) return null;
    return {
      openingOdds: opening.decimalOdds as DecimalString,
      currentOdds: current.decimalOdds as DecimalString,
      bookmakerCoverage: bookmakerCount,
      bookmakersMoving: movingBookmakers,
      consensus: consensusResult.value,
      divergence: divergenceResult.value,
      supportingObservationIds: windowRows.map((row) => row.id),
      observedAt: current.providerObservedAt.toISOString(),
      openingObservedAt: opening.providerObservedAt.toISOString(),
      formula,
    };
  }
}

export class DatabaseScoreWriter implements ScoreWriter {
  private readonly scores: DatabaseScoreRepository;
  private readonly quality: DatabaseQualityRepository;

  constructor(private readonly database: PrivilegedVelyqDatabase) {
    this.scores = new DatabaseScoreRepository(database);
    this.quality = new DatabaseQualityRepository(database);
  }

  async append(input: ScoreWriteInput): Promise<void> {
    const [definition] = await this.database
      .select({
        definition: scoreDefinitionVersions.definition,
        validationStatus: scoreDefinitionVersions.validationStatus,
        scoreType: scoreDefinitionVersions.scoreType,
      })
      .from(scoreDefinitionVersions)
      .where(eq(scoreDefinitionVersions.id, input.scoreDefinitionVersionId))
      .limit(1);
    if (!definition) throw new Error("SCORE_DEFINITION_MISSING");
    const expectedScoreType = input.radarEvidence ? "RADAR" : "EDGE";
    if (definition.scoreType !== expectedScoreType)
      throw new Error("SCORE_DEFINITION_TYPE_MISMATCH");
    if (definition.validationStatus !== input.validationStatus) {
      throw new Error("SCORE_DEFINITION_STATUS_MISMATCH");
    }
    const metadata = scoreDefinitionMetadata(definition.definition);
    const quality = await this.quality.getLatestAsOf(
      input.eventId,
      new Date(input.asOf),
      input.eventMarketOutcomeId,
    );
    if (!quality) throw new Error("QUALITY_ASSESSMENT_MISSING");
    const scoreInput = {
      scoreDefinitionVersionId: input.scoreDefinitionVersionId,
      predictionId: input.predictionId ?? null,
      eventMarketOutcomeId: input.eventMarketOutcomeId,
      dataQualityAssessmentId: quality.id,
      asOf: new Date(input.asOf),
      score: input.score,
      components: input.components,
      weights: metadata.weights,
      capsPenalties: metadata.capsPenalties,
      reasonCodes: input.reasonCodes,
      idempotencyKey: `score:${input.jobId}`,
      createdAt: new Date(input.asOf),
    } as const;
    if (!input.radarEvidence) {
      await this.scores.append(scoreInput);
      return;
    }
    await this.scores.appendWithRadarEvidence(scoreInput, {
      openingObservationId: input.radarEvidence.openingObservationId,
      currentObservationId: input.radarEvidence.currentObservationId,
      supportingObservationIds: input.radarEvidence
        .supportingObservationIds ?? [
        input.radarEvidence.openingObservationId,
        input.radarEvidence.currentObservationId,
      ],
      bookmakersObserved: input.radarEvidence.bookmakersObserved,
      bookmakersMoving: input.radarEvidence.bookmakersMoving,
      movementWindowSeconds: input.radarEvidence.movementWindowSeconds,
      observableMetrics: input.components,
    });
  }
}

export interface RadarInputReader {
  getInput(input: CalculateRadarPayload): Promise<Readonly<{
    openingOdds: DecimalString;
    currentOdds: DecimalString;
    bookmakerCoverage: number;
    observedAt: string;
    openingObservedAt?: string;
    bookmakersMoving?: number;
    consensus?: DecimalString;
    divergence?: DecimalString;
    supportingObservationIds?: readonly string[];
    formula?: HeuristicFormula;
  }> | null>;
}

export async function consumeQueuedEdgeJob(
  job: Job,
  reader: EdgeInputReader,
  writer: ScoreWriter,
): Promise<ScoreWriteInput> {
  const validation = validateJob(job);
  if (!validation.ok || job.type !== "CALCULATE_EDGE")
    throw new Error("INVALID_CALCULATE_EDGE_JOB");
  const payload = job.payload as CalculateEdgePayload;
  const input = await reader.getInput(payload);
  if (!input) throw new Error("EDGE_INPUTS_MISSING");
  const result = calculateEdge({
    ...input,
    scoreVersion: payload.scoreDefinitionVersionId,
  });
  if (!result.ok) throw new Error("EDGE_CALCULATION_FAILED");
  const output: ScoreWriteInput = {
    jobId: job.id,
    eventId: payload.eventId,
    eventMarketOutcomeId: payload.eventMarketOutcomeId,
    scoreDefinitionVersionId: payload.scoreDefinitionVersionId,
    asOf: payload.asOf,
    score: result.value.score,
    predictionId: payload.predictionId,
    validationStatus: result.value.validationStatus,
    components: result.value.components,
    reasonCodes: result.value.reasonCodes,
  };
  await writer.append(output);
  return output;
}

export async function consumeQueuedRadarJob(
  job: Job,
  reader: RadarInputReader,
  writer: ScoreWriter,
): Promise<ScoreWriteInput> {
  const validation = validateJob(job);
  if (!validation.ok || job.type !== "CALCULATE_RADAR")
    throw new Error("INVALID_CALCULATE_RADAR_JOB");
  const payload = job.payload as CalculateRadarPayload;
  const input = await reader.getInput(payload);
  if (!input) throw new Error("RADAR_INPUTS_MISSING");
  const result = calculateRadar({
    ...input,
    asOf: payload.asOf,
    scoreVersion: payload.scoreDefinitionVersionId,
    bookmakersMoving: input.bookmakersMoving ?? 0,
    ...(input.consensus ? { consensus: input.consensus } : {}),
    ...(input.divergence ? { divergence: input.divergence } : {}),
    ...(input.openingObservedAt
      ? {
          movementWindowSeconds: Math.max(
            0,
            Math.floor(
              (Date.parse(input.observedAt) -
                Date.parse(input.openingObservedAt)) /
                1000,
            ),
          ),
        }
      : {}),
  });
  if (!result.ok) throw new Error("RADAR_CALCULATION_FAILED");
  const output: ScoreWriteInput = {
    jobId: job.id,
    eventId: payload.eventId,
    eventMarketOutcomeId: payload.eventMarketOutcomeId,
    scoreDefinitionVersionId: payload.scoreDefinitionVersionId,
    asOf: payload.asOf,
    score: result.value.score,
    validationStatus: result.value.validationStatus,
    components: result.value.components,
    reasonCodes: result.value.reasonCodes,
    radarEvidence: {
      openingObservationId: payload.openingObservationId,
      currentObservationId: payload.currentObservationId,
      openingOdds: result.value.openingOdds,
      currentOdds: result.value.currentOdds,
      bookmakersObserved: input.bookmakerCoverage,
      bookmakersMoving:
        input.bookmakersMoving ??
        (result.value.openingOdds === result.value.currentOdds
          ? 0
          : input.bookmakerCoverage),
      movementWindowSeconds: input.openingObservedAt
        ? Math.max(
            0,
            Math.floor(
              (Date.parse(input.observedAt) -
                Date.parse(input.openingObservedAt)) /
                1000,
            ),
          )
        : 0,
      ...(input.supportingObservationIds
        ? { supportingObservationIds: input.supportingObservationIds }
        : {}),
      ...(input.consensus ? { consensus: input.consensus } : {}),
      ...(input.divergence ? { divergence: input.divergence } : {}),
    },
  };
  await writer.append(output);
  return output;
}

export async function consumeQueuedPredictionJobWithInputs(
  job: Job,
  reader: PredictionObservationReader,
  repository: PredictionRepository = new InMemoryPredictionRepository(),
): Promise<PredictionJobResult> {
  const validation = validateJob(job);
  if (!validation.ok || job.type !== "GENERATE_PREDICTION")
    throw new Error("INVALID_GENERATE_PREDICTION_JOB");
  const payload = job.payload as PredictionInput;
  const observations = await reader.getByIds(payload.sourceObservationIds);
  if (observations.length !== payload.sourceObservationIds.length)
    throw new Error("PREDICTION_INPUTS_MISSING");
  const cutoff = Date.parse(payload.featureCutoff);
  const ids = new Set(payload.sourceObservationIds);
  if (
    observations.some(
      (observation) =>
        !ids.has(observation.id) ||
        observation.eventId !== payload.eventId ||
        observation.eventMarketOutcomeId !== payload.eventMarketOutcomeId ||
        Date.parse(observation.receivedAt) > cutoff,
    )
  )
    throw new Error("PREDICTION_INPUTS_OUTSIDE_CUTOFF");
  return generatePrediction(
    {
      id: job.id,
      idempotencyKey: job.idempotencyKey,
      createdAt: job.createdAt,
      correlationId: job.correlationId,
      causationId: job.causationId,
      payload,
    },
    repository,
  );
}

/** Deterministic repository seam; production wiring can implement this contract transactionally. */
export class InMemoryPredictionRepository implements PredictionRepository {
  private readonly predictions = new Map<string, PredictionRecord>();

  getByIdempotencyKey(idempotencyKey: string) {
    return this.predictions.get(idempotencyKey);
  }

  save(idempotencyKey: string, prediction: PredictionRecord) {
    const existing = this.predictions.get(idempotencyKey);
    if (existing) return existing;
    this.predictions.set(idempotencyKey, prediction);
    return prediction;
  }
}

function isQualityGateRefusal(
  quality: DataQualityAssessment,
  input: PredictionInput,
): boolean {
  return (
    quality.grade === "C" ||
    quality.grade === "F" ||
    quality.reasonCodes.includes("STALE_DATA") ||
    quality.reasonCodes.includes("MISSING_PRICE") ||
    quality.reasonCodes.includes("NO_BOOKMAKER_COVERAGE") ||
    input.quality.lineup === "MISSING" ||
    input.quality.lineup === "CHANGED" ||
    !input.quality.edgeAvailable
  );
}

export function generatePrediction(
  job: PredictionJob,
  repository: PredictionRepository,
): PredictionJobResult {
  const existing = repository.getByIdempotencyKey(job.idempotencyKey);
  if (existing) return { prediction: existing, duplicate: true };

  const quality = assessDataQuality(job.payload.quality);
  const value = calculateValue(
    job.payload.modelProbability,
    job.payload.currentOdds,
  );
  const gateRefused = isQualityGateRefusal(quality, job.payload) || !value.ok;
  const edgePresent = value.ok && job.payload.quality.edgePresent;
  const recommendation = decideRecommendation({
    quality,
    lineup: job.payload.quality.lineup,
    edgeAvailable: job.payload.quality.edgeAvailable,
    edgePresent,
  });
  const accepted = !gateRefused && recommendation === "NO_BET" && edgePresent;
  const decisionStatus: RecommendationStatus = accepted
    ? "STRONG_EDGE"
    : recommendation;
  const reasonCodes = [
    ...quality.reasonCodes,
    ...(gateRefused && value.ok ? ["QUALITY_GATE_REFUSED"] : []),
    ...(gateRefused && !value.ok ? ["INVALID_VALUE_INPUT"] : []),
  ];
  const metrics = accepted && value.ok ? value.value : null;
  const prediction: PredictionRecord = Object.freeze({
    id: `prediction:${job.idempotencyKey}`,
    eventId: job.payload.eventId,
    eventMarketOutcomeId: job.payload.eventMarketOutcomeId,
    decisionStatus,
    quality,
    modelProbability: metrics ? job.payload.modelProbability : null,
    confidence: metrics ? (quality.score as DecimalString) : null,
    fairOdds: metrics ? metrics.fairOdds : null,
    marketImpliedProbability: metrics ? metrics.impliedProbability : null,
    edge: metrics ? metrics.probabilityEdge : null,
    expectedValue: metrics ? metrics.expectedValue : null,
    reasonCodes,
    trace: Object.freeze({
      triggerJobId: job.id,
      correlationId: job.correlationId,
      causationId: job.causationId,
      featureCutoff: job.payload.featureCutoff,
      modelVersion: job.payload.modelVersion,
      calibrationVersion: job.payload.calibrationVersion,
      sourceObservationIds: [...job.payload.sourceObservationIds],
    }),
    createdAt: job.createdAt,
  });
  const persisted = repository.save(job.idempotencyKey, prediction);
  return { prediction: persisted, duplicate: persisted !== prediction };
}

export function consumePredictionJob(
  job: PredictionJob,
  repository = new InMemoryPredictionRepository(),
): PredictionJobResult {
  return generatePrediction(job, repository);
}

/** Adapts the versioned queue contract to the prediction use case. */
export function consumeQueuedPredictionJob(
  job: Job,
  repository: PredictionRepository = new InMemoryPredictionRepository(),
): PredictionJobResult {
  const validation = validateJob(job);
  if (!validation.ok || job.type !== "GENERATE_PREDICTION")
    throw new Error("INVALID_GENERATE_PREDICTION_JOB");
  return generatePrediction(
    {
      id: job.id,
      idempotencyKey: job.idempotencyKey,
      createdAt: job.createdAt,
      correlationId: job.correlationId,
      causationId: job.causationId,
      payload: job.payload as PredictionInput,
    },
    repository,
  );
}
