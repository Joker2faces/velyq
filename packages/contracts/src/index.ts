import {
  decimalOdds,
  edge,
  expectedValue,
  parseDecimalString,
  probability,
  subtractDecimalStrings,
  type DecimalResult,
} from "@velyq/decimal";
import type {
  DecimalOdds,
  DecimalString,
  MarketLine,
  Probability,
} from "@velyq/decimal";

export const SYNTHETIC_DATA_LABEL = "Synthetic data" as const;

export type SyntheticMetadata = Readonly<{
  readonly isSynthetic: true;
  readonly syntheticLabel: typeof SYNTHETIC_DATA_LABEL;
}>;

export type ProviderCapability = "FIXTURES" | "ODDS" | "LINEUPS";

export type ProvenanceRef = SyntheticMetadata &
  Readonly<{
    readonly providerId: string;
    readonly providerCode: string;
    readonly providerExternalId: string;
    readonly providerObservedAt: string;
    readonly receivedAt: string;
    readonly normalizedAt: string;
    readonly ingestionRunId: string;
    readonly sourceObservationId: string;
    readonly normalizationVersion: string;
    readonly mappingVersion: string;
    readonly sourceObservationHash: string;
    readonly sourceFixtureHash: string;
    readonly fixturePath: string;
  }>;

export type ScenarioState =
  | "OPENING_PRICE"
  | "CURRENT_PRICE"
  | "STALE_PRICE"
  | "MISSING_PRICE"
  | "EXPECTED_LINEUP"
  | "CHANGED_LINEUP"
  | "OFFICIAL_LINEUP"
  | "MISSING_LINEUP"
  | "STRONG_EDGE"
  | "NO_BET"
  | "WAIT_FOR_LINEUP"
  | "RADAR_MOVEMENT"
  | "EDGE_DISAPPEARED"
  | "INSUFFICIENT_DATA";

export type NormalizedFixtureObservation = SyntheticMetadata &
  Readonly<{
    readonly eventId: string;
    readonly competitionId: string;
    readonly homeTeamId: string;
    readonly awayTeamId: string;
    readonly startsAt: string;
    readonly status: "SCHEDULED";
    readonly scenarioStates: readonly ScenarioState[];
    readonly provenance: ProvenanceRef;
  }>;

export type NormalizedOddsObservation = SyntheticMetadata &
  Readonly<{
    readonly eventId: string;
    readonly bookmakerId: string;
    readonly marketDefinitionCode:
      "FOOTBALL_FULL_TIME_1X2" | "FOOTBALL_FULL_TIME_TOTAL";
    readonly outcomeCode: "HOME" | "DRAW" | "AWAY" | "OVER" | "UNDER";
    readonly marketKey: string;
    readonly outcomeKey: string;
    readonly line?: MarketLine;
    readonly decimalOdds: DecimalOdds;
    readonly status: "ACTIVE" | "SUSPENDED" | "REMOVED";
    readonly scenarioStates: readonly ScenarioState[];
    readonly provenance: ProvenanceRef;
  }>;

export type NormalizedLineupObservation = SyntheticMetadata &
  Readonly<{
    readonly eventId: string;
    readonly teamId: string;
    readonly status: "EXPECTED" | "CHANGED" | "OFFICIAL" | "MISSING";
    readonly confidence: Probability;
    readonly players: readonly (SyntheticMetadata &
      Readonly<{ readonly id: string; readonly displayName: string }>)[];
    readonly formation: string | null;
    readonly scenarioStates: readonly ScenarioState[];
    readonly provenance: ProvenanceRef;
  }>;

export type NormalizedObservationBatch<T> = SyntheticMetadata &
  Readonly<{
    readonly providerCode: string;
    readonly capability: ProviderCapability;
    readonly schemaVersion: string;
    readonly observationWindow: Readonly<{
      readonly from: string;
      readonly to: string;
    }>;
    readonly providerRequestId: string;
    readonly receivedAt: string;
    readonly normalizationVersion: string;
    readonly mappingVersion: string;
    readonly observations: readonly T[];
    readonly sourceFixtureHash: string;
    readonly normalizedOutputHash: string;
  }>;

export type FixtureObservationBatch =
  NormalizedObservationBatch<NormalizedFixtureObservation>;
export type OddsObservationBatch =
  NormalizedObservationBatch<NormalizedOddsObservation>;
export type LineupObservationBatch =
  NormalizedObservationBatch<NormalizedLineupObservation>;
export type OddsObservationResult = Readonly<{
  readonly batch: OddsObservationBatch;
  readonly quarantined: readonly QuarantinedProviderObservation[];
}>;

export type ReplayRequest = Readonly<{
  readonly sequenceName: string;
  readonly fixedClock: string;
}>;

export interface FixtureSource {
  listFixtureObservations(
    request: ReplayRequest,
  ): Promise<FixtureObservationBatch>;
}

export interface OddsSource {
  listOddsObservations(request: ReplayRequest): Promise<OddsObservationResult>;
}

export interface LineupSource {
  listLineupObservations(
    request: ReplayRequest,
  ): Promise<LineupObservationBatch>;
}

export type ProviderAction =
  | "RETAIN_RAW"
  | "RETAIN_NORMALIZED"
  | "DISPLAY"
  | "EXPORT"
  | "CACHE"
  | "MODEL_TRAINING"
  | "BACKTEST"
  | "REPLAY";
export type ProviderAudience = "CUSTOMER" | "ADMIN" | "PUBLIC";
export type ProviderEnvironment = "DEVELOPMENT" | "TEST" | "PRODUCTION";
export type ProviderDataCategory =
  | "REPOSITORY_FIXTURE"
  | "NORMALIZED_FIXTURE"
  | "NORMALIZED_ODDS"
  | "NORMALIZED_LINEUP";

export type ProviderPolicyGrant = Readonly<{
  readonly action: ProviderAction;
  readonly environments: readonly ProviderEnvironment[];
  readonly territories: readonly string[];
  readonly dataCategories: readonly ProviderDataCategory[];
  readonly audiences?: readonly ProviderAudience[];
  readonly requiredAttribution: boolean;
  readonly retentionDays?: number;
}>;

export type ProviderDataPolicy = Readonly<{
  readonly providerCode: string;
  readonly version: string;
  readonly providerMode: "SYNTHETIC";
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly grants: readonly ProviderPolicyGrant[];
}>;

export type PolicyDecision =
  | Readonly<{ readonly allowed: true; readonly policyVersion: string }>
  | Readonly<{
      readonly allowed: false;
      readonly policyVersion: string | null;
      readonly reason:
        | "INVALID_POLICY"
        | "INVALID_REQUEST"
        | "POLICY_NOT_EFFECTIVE"
        | "ACTION_NOT_GRANTED"
        | "AUDIENCE_NOT_GRANTED"
        | "ENVIRONMENT_NOT_GRANTED"
        | "TERRITORY_NOT_GRANTED"
        | "DATA_CATEGORY_NOT_GRANTED"
        | "ATTRIBUTION_REQUIRED";
    }>;

export type ProviderMarketMapping = Readonly<{
  readonly id: string;
  readonly providerMarketKey: string;
  readonly providerOutcomeKey: string;
  readonly canonicalDefinitionCode:
    "FOOTBALL_FULL_TIME_1X2" | "FOOTBALL_FULL_TIME_TOTAL";
  readonly canonicalOutcomeCode: "HOME" | "DRAW" | "AWAY" | "OVER" | "UNDER";
  readonly mappingVersion: string;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
}>;

export type QuarantineReason =
  | "INVALID_MAPPING_DOCUMENT"
  | "UNMAPPED_PROVIDER_MARKET"
  | "AMBIGUOUS_PROVIDER_MARKET"
  | "INVALID_MARKET_LINE"
  | "INVALID_MARKET_IDENTITY";

export type QuarantinedProviderObservation = SyntheticMetadata &
  Readonly<{
    readonly sourceObservationId: string;
    readonly providerMarketKey: string;
    readonly providerOutcomeKey: string;
    readonly reason: QuarantineReason;
    readonly provenance: ProvenanceRef;
  }>;

export type SyntheticScenarioEvidence =
  | Readonly<{ readonly kind: "PRICE"; readonly value: string }>
  | Readonly<{ readonly kind: "LINEUP"; readonly value: string }>
  | Readonly<{ readonly kind: "DECISION"; readonly value: string }>
  | Readonly<{ readonly kind: "QUALITY"; readonly value: string }>
  | Readonly<{ readonly kind: "ABSENCE"; readonly value: string }>;

export type SyntheticScenarioRecord = SyntheticMetadata &
  Readonly<{
    readonly id: string;
    readonly state: ScenarioState;
    readonly eventId: string;
    readonly sourceObservationIds: readonly string[];
    readonly evidence: SyntheticScenarioEvidence;
    readonly marketKey?: string;
    readonly outcomeKey?: string;
    readonly teamId?: string;
  }>;

export type SyntheticReplayResult = SyntheticMetadata &
  Readonly<{
    readonly sequenceName: string;
    readonly fixturePath: string;
    readonly sourceFixtureHash: string;
    readonly normalizedOutputHash: string;
    readonly scenarios: readonly SyntheticScenarioRecord[];
    readonly fixtures: FixtureObservationBatch;
    readonly odds: OddsObservationBatch;
    readonly lineups: LineupObservationBatch;
    readonly quarantined: readonly QuarantinedProviderObservation[];
  }>;

export const JOB_CONTRACT_VERSIONS = {
  INGEST_PROVIDER_SEQUENCE: "INGEST_PROVIDER_SEQUENCE.v1",
  GENERATE_PREDICTION: "GENERATE_PREDICTION.v1",
  CALCULATE_EDGE: "CALCULATE_EDGE.v1",
  CALCULATE_RADAR: "CALCULATE_RADAR.v1",
} as const;

export type JobType = keyof typeof JOB_CONTRACT_VERSIONS;
export type JobStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
export type IngestProviderSequencePayload = Readonly<{
  readonly sequenceName: string;
  readonly fixedClock: string;
}>;
export type GeneratePredictionPayload = Readonly<{
  readonly eventId: string;
  readonly eventMarketOutcomeId: string;
  readonly modelProbability: DecimalString;
  readonly currentOdds: DecimalOdds["value"];
  readonly quality: Readonly<{
    readonly policyVersion: string;
    readonly asOf: string;
    readonly receivedAt: string;
    readonly priceCount: number;
    readonly bookmakerCount: number;
    readonly lineup: "EXPECTED" | "OFFICIAL" | "MISSING" | "CHANGED";
    readonly mappingConfidence: "HIGH" | "LOW";
    readonly edgeAvailable: boolean;
    readonly edgePresent: boolean;
    readonly sourceAuthority?:
      "PRIMARY" | "SECONDARY" | "UNKNOWN" | "HIGH" | "LOW";
    readonly consistency?:
      "CONSISTENT" | "INCONSISTENT" | "CONFLICTING" | "UNKNOWN";
  }>;
  readonly featureCutoff: string;
  readonly modelVersion: string;
  readonly calibrationVersion: string;
  readonly sourceObservationIds: readonly string[];
}>;
export type CalculateEdgePayload = Readonly<{
  readonly eventId: string;
  readonly eventMarketOutcomeId: string;
  readonly predictionId: string;
  readonly scoreDefinitionVersionId: string;
  readonly asOf: string;
}>;
export type CalculateRadarPayload = Readonly<{
  readonly eventId: string;
  readonly eventMarketOutcomeId: string;
  readonly scoreDefinitionVersionId: string;
  readonly openingObservationId: string;
  readonly currentObservationId: string;
  readonly asOf: string;
}>;
export type JobPayload =
  | IngestProviderSequencePayload
  | GeneratePredictionPayload
  | CalculateEdgePayload
  | CalculateRadarPayload;
export type Job = Readonly<{
  readonly id: string;
  readonly type: JobType;
  readonly contractVersion: (typeof JOB_CONTRACT_VERSIONS)[JobType];
  readonly idempotencyKey: string;
  readonly payload: JobPayload;
  readonly status: JobStatus;
  readonly attemptCount: number;
  readonly maxAttempts: number;
  readonly availableAt: string;
  readonly leaseExpiresAt: string | null;
  readonly correlationId: string;
  readonly causationId: string;
  readonly lastError: Readonly<{
    readonly code: string;
    readonly message: string;
  }> | null;
  readonly createdAt: string;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
}>;
export type JobValidation =
  | Readonly<{ readonly ok: true; readonly value: Job }>
  | Readonly<{ readonly ok: false; readonly errors: readonly string[] }>;

export type ContractValidation<T> =
  | Readonly<{ readonly ok: true; readonly value: T }>
  | Readonly<{ readonly ok: false; readonly errors: readonly string[] }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function hasDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isJobType(value: unknown): value is JobType {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(JOB_CONTRACT_VERSIONS, value)
  );
}

function isStatus(value: unknown): value is JobStatus {
  return (
    value === "PENDING" ||
    value === "RUNNING" ||
    value === "COMPLETED" ||
    value === "FAILED"
  );
}

function decimalIsValid(
  value: unknown,
  validator: (input: string) => DecimalResult<unknown>,
): boolean {
  return typeof value === "string" && validator(value).ok;
}

function validPredictionQuality(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    hasText(value["policyVersion"]) &&
    hasDate(value["asOf"]) &&
    hasDate(value["receivedAt"]) &&
    Number.isSafeInteger(value["priceCount"]) &&
    (value["priceCount"] as number) >= 0 &&
    Number.isSafeInteger(value["bookmakerCount"]) &&
    (value["bookmakerCount"] as number) >= 0 &&
    ["EXPECTED", "OFFICIAL", "MISSING", "CHANGED"].includes(
      value["lineup"] as string,
    ) &&
    ["HIGH", "LOW"].includes(value["mappingConfidence"] as string) &&
    typeof value["edgeAvailable"] === "boolean" &&
    typeof value["edgePresent"] === "boolean" &&
    (value["sourceAuthority"] === undefined ||
      ["PRIMARY", "SECONDARY", "UNKNOWN", "HIGH", "LOW"].includes(
        value["sourceAuthority"] as string,
      )) &&
    (value["consistency"] === undefined ||
      ["CONSISTENT", "INCONSISTENT", "CONFLICTING", "UNKNOWN"].includes(
        value["consistency"] as string,
      ))
  );
}

export function validateIngestProviderSequencePayload(
  input: unknown,
): ContractValidation<IngestProviderSequencePayload> {
  if (
    !isRecord(input) ||
    !hasText(input["sequenceName"]) ||
    !hasDate(input["fixedClock"])
  )
    return {
      ok: false,
      errors: ["payload must contain a valid sequenceName and fixedClock"],
    };
  return { ok: true, value: input as IngestProviderSequencePayload };
}

export function validateGeneratePredictionPayload(
  input: unknown,
): ContractValidation<GeneratePredictionPayload> {
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };
  const errors: string[] = [];
  for (const field of ["eventId", "eventMarketOutcomeId"])
    if (!hasText(input[field])) errors.push(`${field} is required`);
  if (!decimalIsValid(input["modelProbability"], probability))
    errors.push("modelProbability must be a valid probability decimal string");
  if (!decimalIsValid(input["currentOdds"], decimalOdds))
    errors.push("currentOdds must be valid decimal odds");
  if (!hasDate(input["featureCutoff"]))
    errors.push("featureCutoff must be a valid timestamp");
  for (const field of ["modelVersion", "calibrationVersion"])
    if (!hasText(input[field])) errors.push(`${field} is required`);
  if (!validPredictionQuality(input["quality"]))
    errors.push("quality does not match the prediction contract");
  const sourceIds = input["sourceObservationIds"];
  if (
    !Array.isArray(sourceIds) ||
    sourceIds.length === 0 ||
    !sourceIds.every(hasText) ||
    new Set(sourceIds).size !== sourceIds.length
  )
    errors.push("sourceObservationIds must contain unique non-empty strings");
  return errors.length
    ? { ok: false, errors }
    : { ok: true, value: input as GeneratePredictionPayload };
}

function validateCalculationPayload(
  input: unknown,
  fields: readonly string[],
): ContractValidation<Record<string, unknown>> {
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };
  const errors = [
    ...fields
      .filter((field) => !hasText(input[field]))
      .map((field) => `${field} is required`),
    ...(hasDate(input["asOf"]) ? [] : ["asOf must be a valid timestamp"]),
  ];
  return errors.length ? { ok: false, errors } : { ok: true, value: input };
}

export function validateCalculateEdgePayload(
  input: unknown,
): ContractValidation<CalculateEdgePayload> {
  const result = validateCalculationPayload(input, [
    "eventId",
    "eventMarketOutcomeId",
    "predictionId",
    "scoreDefinitionVersionId",
  ]);
  return result.ok
    ? { ok: true, value: result.value as CalculateEdgePayload }
    : result;
}

export function validateCalculateRadarPayload(
  input: unknown,
): ContractValidation<CalculateRadarPayload> {
  const result = validateCalculationPayload(input, [
    "eventId",
    "eventMarketOutcomeId",
    "scoreDefinitionVersionId",
    "openingObservationId",
    "currentObservationId",
  ]);
  return result.ok
    ? { ok: true, value: result.value as CalculateRadarPayload }
    : result;
}

export function validateJob(input: unknown): JobValidation {
  if (!isRecord(input)) return { ok: false, errors: ["job must be an object"] };
  const errors: string[] = [];
  if (!hasText(input["id"])) errors.push("id is required");
  const type = input["type"];
  if (!isJobType(type)) errors.push("type is invalid");
  else if (input["contractVersion"] !== JOB_CONTRACT_VERSIONS[type])
    errors.push("contractVersion does not match type");
  if (!isStatus(input["status"])) errors.push("status is invalid");
  for (const field of ["idempotencyKey", "correlationId", "causationId"])
    if (!hasText(input[field])) errors.push(`${field} is required`);
  if (
    !Number.isSafeInteger(input["maxAttempts"]) ||
    (input["maxAttempts"] as number) < 1
  )
    errors.push("maxAttempts must be positive");
  if (
    !Number.isSafeInteger(input["attemptCount"]) ||
    (input["attemptCount"] as number) < 0
  )
    errors.push("attemptCount must be non-negative");
  for (const field of ["availableAt", "createdAt"])
    if (!hasDate(input[field])) errors.push(`${field} is required`);
  for (const field of ["leaseExpiresAt", "startedAt", "completedAt"])
    if (input[field] !== null && !hasDate(input[field]))
      errors.push(`${field} must be null or a valid timestamp`);
  const lastError = input["lastError"];
  if (
    lastError !== null &&
    (!isRecord(lastError) ||
      !hasText(lastError["code"]) ||
      !hasText(lastError["message"]))
  )
    errors.push("lastError must be null or contain code and message");
  let payloadResult: ContractValidation<unknown> = {
    ok: false,
    errors: ["payload does not match the job contract"],
  };
  if (type === "INGEST_PROVIDER_SEQUENCE")
    payloadResult = validateIngestProviderSequencePayload(input["payload"]);
  else if (type === "GENERATE_PREDICTION")
    payloadResult = validateGeneratePredictionPayload(input["payload"]);
  else if (type === "CALCULATE_EDGE")
    payloadResult = validateCalculateEdgePayload(input["payload"]);
  else if (type === "CALCULATE_RADAR")
    payloadResult = validateCalculateRadarPayload(input["payload"]);
  if (!payloadResult.ok) errors.push("payload does not match the job contract");
  return errors.length
    ? { ok: false, errors }
    : { ok: true, value: Object.freeze(input as Job) };
}

export type ProviderRunStatus = "RUNNING" | "COMPLETED" | "FAILED";
export type ProviderRun = Readonly<{
  id: string;
  providerCode: string;
  sequenceName: string;
  status: ProviderRunStatus;
  sourceFixtureHash: string;
  normalizedOutputHash: string | null;
  receivedCount: number;
  acceptedCount: number;
  rejectedCount: number;
  startedAt: string;
  completedAt: string | null;
  errorSummary: Readonly<{ code: string; message: string }> | null;
}>;

export type ProblemDetails = Readonly<{
  type: string;
  title: string;
  status: number;
  code: string;
  requestId: string;
}>;

export function validateProblemDetails(
  input: unknown,
): ContractValidation<ProblemDetails> {
  if (!isRecord(input))
    return { ok: false, errors: ["problem details must be an object"] };
  const errors: string[] = [];
  const status = input["status"];
  for (const field of ["type", "title", "code", "requestId"])
    if (!hasText(input[field])) errors.push(`${field} is required`);
  if (
    !Number.isSafeInteger(status) ||
    (status as number) < 100 ||
    (status as number) > 599
  )
    errors.push("status must be an HTTP status");
  return errors.length
    ? { ok: false, errors }
    : { ok: true, value: input as ProblemDetails };
}

export type RecommendationStatus =
  | "STRONG_EDGE"
  | "NO_BET"
  | "WAIT"
  | "WAIT_FOR_LINEUP"
  | "INSUFFICIENT_DATA"
  | "EDGE_DISAPPEARED";
export type CustomerMatchDto = Readonly<{
  eventId: string;
  homeTeam: string;
  awayTeam: string;
  competition: string;
  startsAt: string;
  syntheticLabel: typeof SYNTHETIC_DATA_LABEL;
  freshness: "FRESH" | "STALE";
  selection: string;
  recommendation: RecommendationStatus;
  modelProbability: DecimalString | null;
  impliedProbability: DecimalString | null;
  fairOdds: DecimalString | null;
  currentOdds: DecimalOdds["value"] | null;
  openingOdds: DecimalOdds["value"] | null;
  movementPercent: DecimalString | null;
  probabilityEdge: DecimalString | null;
  expectedValue: DecimalString | null;
  lineup: "EXPECTED" | "OFFICIAL" | "MISSING" | "CHANGED";
  quality: Readonly<{
    grade: string;
    score: DecimalString;
    policyVersion: string;
    reasonCodes: readonly string[];
  }>;
  trace: Readonly<{
    modelVersion: string;
    modelDefinitionVersion?: string;
    maturity: "EXPERIMENTAL";
    calibrationVersion: string;
    calibrationDefinitionVersion?: string;
    scoreVersion: string;
    scoreDefinitionCode?: string;
    scoreWeights?: Readonly<Record<string, unknown>>;
    scoreCapsPenalties?: Readonly<Record<string, unknown>>;
    sourceObservationIds?: readonly string[];
    providerRunId?: string;
    marketPriceObservationId?: string | null;
    qualityAssessmentId?: string;
    featureCutoff: string;
  }>;
}>;
export type CustomerTodayDto = Readonly<{
  syntheticLabel: typeof SYNTHETIC_DATA_LABEL;
  asOf: string;
  matches: readonly CustomerMatchDto[];
}>;

export type CustomerDtoValidation<T> =
  | Readonly<{ readonly ok: true; readonly value: T }>
  | Readonly<{ readonly ok: false; readonly errors: readonly string[] }>;

const customerRecommendationStatuses: readonly RecommendationStatus[] = [
  "STRONG_EDGE",
  "NO_BET",
  "WAIT",
  "WAIT_FOR_LINEUP",
  "INSUFFICIENT_DATA",
  "EDGE_DISAPPEARED",
];
const customerLineupStatuses = [
  "EXPECTED",
  "OFFICIAL",
  "MISSING",
  "CHANGED",
] as const;
const customerQualityGrades = ["A", "B", "C", "D", "F"] as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isTimestamp(value: unknown): value is string {
  return isNonEmptyString(value) && Number.isFinite(Date.parse(value));
}

function validateCustomerDecimal(
  value: unknown,
  path: string,
  errors: string[],
  parser: (input: string) => DecimalResult<unknown>,
): void {
  if (typeof value !== "string" || !parser(value).ok)
    errors.push(`${path} must be a valid canonical decimal string`);
}

function validateNullableCustomerDecimal(
  value: unknown,
  path: string,
  errors: string[],
  parser: (input: string) => DecimalResult<unknown>,
): void {
  if (value !== null) validateCustomerDecimal(value, path, errors, parser);
}

function fairOddsDecimal(value: string): DecimalResult<unknown> {
  const parsed = parseDecimalString(value);
  if (!parsed.ok) return parsed;
  const difference = subtractDecimalStrings(parsed.value, "1" as DecimalString);
  if (
    !difference.ok ||
    difference.value === "0" ||
    difference.value.startsWith("-")
  )
    return {
      ok: false,
      error: {
        code: "OUT_OF_RANGE",
        message: "Fair odds must be greater than 1.",
      },
    };
  return parsed;
}

function validateCustomerMatchInput(input: unknown): string[] {
  const errors: string[] = [];
  if (!isObject(input)) return ["match must be an object"];

  for (const field of [
    "eventId",
    "homeTeam",
    "awayTeam",
    "competition",
    "selection",
  ]) {
    if (!isNonEmptyString(input[field])) errors.push(`${field} is required`);
  }
  if (!isTimestamp(input["startsAt"])) errors.push("startsAt is invalid");
  if (input["syntheticLabel"] !== SYNTHETIC_DATA_LABEL)
    errors.push("syntheticLabel is invalid");
  if (!["FRESH", "STALE"].includes(input["freshness"] as string))
    errors.push("freshness is invalid");
  if (
    !customerRecommendationStatuses.includes(
      input["recommendation"] as RecommendationStatus,
    )
  )
    errors.push("recommendation is invalid");
  if (
    !customerLineupStatuses.includes(
      input["lineup"] as (typeof customerLineupStatuses)[number],
    )
  )
    errors.push("lineup is invalid");

  validateNullableCustomerDecimal(
    input["modelProbability"],
    "modelProbability",
    errors,
    (value) => probability(value),
  );
  validateNullableCustomerDecimal(
    input["impliedProbability"],
    "impliedProbability",
    errors,
    (value) => probability(value),
  );
  validateNullableCustomerDecimal(
    input["fairOdds"],
    "fairOdds",
    errors,
    (value) => fairOddsDecimal(value),
  );
  validateNullableCustomerDecimal(
    input["currentOdds"],
    "currentOdds",
    errors,
    (value) => decimalOdds(value),
  );
  validateNullableCustomerDecimal(
    input["openingOdds"],
    "openingOdds",
    errors,
    (value) => decimalOdds(value),
  );
  validateNullableCustomerDecimal(
    input["movementPercent"],
    "movementPercent",
    errors,
    (value) => parseDecimalString(value),
  );
  validateNullableCustomerDecimal(
    input["probabilityEdge"],
    "probabilityEdge",
    errors,
    (value) => edge(value),
  );
  validateNullableCustomerDecimal(
    input["expectedValue"],
    "expectedValue",
    errors,
    (value) => expectedValue(value),
  );

  if (!isObject(input["quality"])) {
    errors.push("quality is required");
  } else {
    const quality = input["quality"];
    if (!customerQualityGrades.includes(quality["grade"] as never))
      errors.push("quality.grade is invalid");
    validateCustomerDecimal(
      quality["score"],
      "quality.score",
      errors,
      (value) => probability(value),
    );
    if (!isNonEmptyString(quality["policyVersion"]))
      errors.push("quality.policyVersion is required");
    if (
      !Array.isArray(quality["reasonCodes"]) ||
      !quality["reasonCodes"].every(isNonEmptyString)
    )
      errors.push("quality.reasonCodes must contain non-empty strings");
  }

  if (!isObject(input["trace"])) {
    errors.push("trace is required");
  } else {
    const trace = input["trace"];
    for (const field of [
      "modelVersion",
      "calibrationVersion",
      "scoreVersion",
    ]) {
      if (!isNonEmptyString(trace[field]))
        errors.push(`trace.${field} is required`);
    }
    if (trace["maturity"] !== "EXPERIMENTAL")
      errors.push("trace.maturity is invalid");
    if (!isTimestamp(trace["featureCutoff"]))
      errors.push("trace.featureCutoff is invalid");
    for (const field of [
      "modelDefinitionVersion",
      "calibrationDefinitionVersion",
      "scoreDefinitionCode",
      "providerRunId",
      "qualityAssessmentId",
    ]) {
      if (trace[field] !== undefined && !isNonEmptyString(trace[field]))
        errors.push(`trace.${field} must be a non-empty string`);
    }
    if (
      trace["marketPriceObservationId"] !== undefined &&
      trace["marketPriceObservationId"] !== null &&
      !isNonEmptyString(trace["marketPriceObservationId"])
    )
      errors.push(
        "trace.marketPriceObservationId must be null or a non-empty string",
      );
    if (
      trace["sourceObservationIds"] !== undefined &&
      (!Array.isArray(trace["sourceObservationIds"]) ||
        !trace["sourceObservationIds"].every(isNonEmptyString) ||
        new Set(trace["sourceObservationIds"]).size !==
          trace["sourceObservationIds"].length)
    )
      errors.push("trace.sourceObservationIds must contain non-empty strings");
  }

  return errors;
}

export function validateCustomerMatchDto(
  input: unknown,
): CustomerDtoValidation<CustomerMatchDto> {
  const errors = validateCustomerMatchInput(input);
  return errors.length
    ? { ok: false, errors }
    : { ok: true, value: Object.freeze(input as CustomerMatchDto) };
}

export function validateCustomerTodayDto(
  input: unknown,
): CustomerDtoValidation<CustomerTodayDto> {
  if (!isObject(input))
    return { ok: false, errors: ["today must be an object"] };
  const errors: string[] = [];
  if (input["syntheticLabel"] !== SYNTHETIC_DATA_LABEL)
    errors.push("syntheticLabel is invalid");
  if (!isTimestamp(input["asOf"])) errors.push("asOf is invalid");
  if (!Array.isArray(input["matches"])) {
    errors.push("matches must be an array");
  } else {
    input["matches"].forEach((match, index) => {
      for (const error of validateCustomerMatchInput(match))
        errors.push(`matches[${index}].${error}`);
    });
  }
  return errors.length
    ? { ok: false, errors }
    : { ok: true, value: Object.freeze(input as CustomerTodayDto) };
}
