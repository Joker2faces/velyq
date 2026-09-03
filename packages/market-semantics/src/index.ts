import { marketLine, type MarketLine } from "@velyq/decimal";
import type { EventId, PlayerId, TeamId } from "@velyq/domain";

export type SportCode = "FOOTBALL";
export type MarketFamilyCode =
  | "MATCH_RESULT"
  | "TOTAL"
  | "ASIAN_TOTAL"
  | "ASIAN_HANDICAP"
  | "TEAM_TOTAL"
  | "PLAYER_SHOTS"
  | "PLAYER_SHOTS_ON_TARGET"
  | "GOALKEEPER_SAVES"
  | "ANYTIME_GOALSCORER"
  | "PLAYER_CARD"
  | "CORNERS_HANDICAP";
export type PeriodCode = "FULL_TIME" | "FIRST_HALF";
export type MarketStructure = "TWO_WAY" | "THREE_WAY" | "MULTI_OUTCOME";
export type SubjectType = "EVENT" | "TEAM" | "PLAYER";
export type SubjectRole = "NONE" | "HOME_TEAM" | "AWAY_TEAM" | "NAMED_PLAYER";
export type LinePolicy = "REQUIRED" | "FORBIDDEN";
export type LineIncrement = "WHOLE" | "HALF" | "QUARTER";
export type MarketOutcomeCode =
  "HOME" | "DRAW" | "AWAY" | "OVER" | "UNDER" | "YES" | "NO";

const canonicalOutcomeCodes: ReadonlySet<string> = new Set([
  "HOME",
  "DRAW",
  "AWAY",
  "OVER",
  "UNDER",
  "YES",
  "NO",
]);

export type MarketDefinitionInput = Readonly<{
  readonly code: string;
  readonly sportCode: SportCode;
  readonly familyCode: MarketFamilyCode;
  readonly periodCode: PeriodCode;
  readonly structure: MarketStructure;
  readonly subjectType: SubjectType;
  readonly linePolicy: LinePolicy;
  readonly allowedLineIncrement?: LineIncrement;
  readonly outcomeCodes: readonly string[];
  readonly settlementRuleVersion: string;
}>;

export type MarketDefinition = Readonly<{
  readonly kind: "MarketDefinition";
  readonly code: string;
  readonly sportCode: SportCode;
  readonly familyCode: MarketFamilyCode;
  readonly periodCode: PeriodCode;
  readonly structure: MarketStructure;
  readonly subjectType: SubjectType;
  readonly linePolicy: LinePolicy;
  readonly allowedLineIncrement?: LineIncrement;
  readonly outcomeCodes: readonly MarketOutcomeCode[];
  readonly settlementRuleVersion: string;
}>;

export type TeamMarketSubject = Readonly<{
  readonly type: "TEAM";
  readonly role: "HOME_TEAM" | "AWAY_TEAM";
  readonly id: TeamId;
}>;

export type PlayerMarketSubject = Readonly<{
  readonly type: "PLAYER";
  readonly role: "NAMED_PLAYER";
  readonly id: PlayerId;
}>;

export type MarketSubject = TeamMarketSubject | PlayerMarketSubject;

export type EventMarketInput = Readonly<{
  readonly definition: MarketDefinition;
  readonly eventId: EventId;
  readonly line?: MarketLine;
  readonly subject?: MarketSubject;
}>;

export type EventMarket = Readonly<{
  readonly kind: "EventMarket";
  readonly definition: MarketDefinition;
  readonly eventId: EventId;
  readonly line?: MarketLine;
  readonly subject?: MarketSubject;
}>;

export type MarketKey = Readonly<{
  readonly kind: "MarketKey";
  readonly sportCode: SportCode;
  readonly familyCode: MarketFamilyCode;
  readonly periodCode: PeriodCode;
  readonly structure: MarketStructure;
  readonly subjectType: SubjectType;
  readonly subjectRole: SubjectRole;
  readonly line?: MarketLine;
  readonly outcomeCode: MarketOutcomeCode;
  readonly settlementRuleVersion: string;
}>;

export type MarketOutcome = Readonly<{
  readonly kind: "MarketOutcome";
  readonly eventMarket: EventMarket;
  readonly outcomeCode: MarketOutcomeCode;
  readonly key: MarketKey;
}>;

export type MarketSemanticsErrorCode =
  | "INVALID_DEFINITION"
  | "LINE_REQUIRED"
  | "LINE_FORBIDDEN"
  | "UNSUPPORTED_LINE_INCREMENT"
  | "SUBJECT_MISMATCH"
  | "OUTCOME_NOT_ALLOWED"
  | "INVALID_MARKET";

export type MarketSemanticsFailure = Readonly<{
  readonly ok: false;
  readonly error: Readonly<{
    readonly code: MarketSemanticsErrorCode;
    readonly message: string;
  }>;
}>;

export type MarketSemanticsSuccess<T> = Readonly<{
  readonly ok: true;
  readonly value: T;
}>;

export type MarketSemanticsResult<T> =
  MarketSemanticsSuccess<T> | MarketSemanticsFailure;

function failure(
  code: MarketSemanticsErrorCode,
  message: string,
): MarketSemanticsFailure {
  return Object.freeze({ ok: false, error: Object.freeze({ code, message }) });
}

function success<T>(value: T): MarketSemanticsSuccess<T> {
  return Object.freeze({ ok: true, value });
}

function validOutcomeCount(structure: MarketStructure, count: number): boolean {
  switch (structure) {
    case "TWO_WAY":
      return count === 2;
    case "THREE_WAY":
      return count === 3;
    case "MULTI_OUTCOME":
      return count > 0;
  }
}

function requiredRole(subjectType: SubjectType): SubjectRole {
  switch (subjectType) {
    case "EVENT":
      return "NONE";
    case "TEAM":
      return "HOME_TEAM";
    case "PLAYER":
      return "NAMED_PLAYER";
  }
}

function lineMatchesIncrement(
  line: MarketLine,
  increment: LineIncrement,
): boolean {
  const decimalPart = line.value.split(".")[1] ?? "";

  switch (increment) {
    case "WHOLE":
      return decimalPart === "";
    case "HALF":
      return decimalPart === "" || decimalPart === "5";
    case "QUARTER":
      return (
        decimalPart === "" ||
        decimalPart === "25" ||
        decimalPart === "5" ||
        decimalPart === "75"
      );
  }
}

export function createMarketDefinition(
  input: MarketDefinitionInput,
): MarketSemanticsResult<MarketDefinition> {
  const outcomeCodes = input.outcomeCodes;
  const outcomesAreDistinct =
    new Set(outcomeCodes).size === outcomeCodes.length;

  if (
    !/^[A-Z][A-Z0-9_]*$/.test(input.code) ||
    !/^[A-Z][A-Z0-9_]*_V[1-9][0-9]*$/.test(input.settlementRuleVersion) ||
    !validOutcomeCount(input.structure, outcomeCodes.length) ||
    !outcomesAreDistinct ||
    outcomeCodes.some(
      (outcomeCode) => !canonicalOutcomeCodes.has(outcomeCode),
    ) ||
    (input.linePolicy === "REQUIRED" &&
      input.allowedLineIncrement === undefined) ||
    (input.linePolicy === "FORBIDDEN" &&
      input.allowedLineIncrement !== undefined)
  ) {
    return failure(
      "INVALID_DEFINITION",
      "The market definition is inconsistent.",
    );
  }

  return success(
    Object.freeze({
      kind: "MarketDefinition" as const,
      code: input.code,
      sportCode: input.sportCode,
      familyCode: input.familyCode,
      periodCode: input.periodCode,
      structure: input.structure,
      subjectType: input.subjectType,
      linePolicy: input.linePolicy,
      ...(input.allowedLineIncrement === undefined
        ? {}
        : { allowedLineIncrement: input.allowedLineIncrement }),
      outcomeCodes: Object.freeze([
        ...input.outcomeCodes,
      ]) as readonly MarketOutcomeCode[],
      settlementRuleVersion: input.settlementRuleVersion,
    }),
  );
}

function canonicalDefinition(input: MarketDefinitionInput): MarketDefinition {
  const result = createMarketDefinition(input);

  if (!result.ok) {
    throw new Error(`Invalid built-in market definition: ${result.error.code}`);
  }

  return result.value;
}

export const canonicalMarketDefinitions = Object.freeze({
  FOOTBALL_FULL_TIME_1X2: canonicalDefinition({
    code: "FOOTBALL_FULL_TIME_1X2",
    sportCode: "FOOTBALL",
    familyCode: "MATCH_RESULT",
    periodCode: "FULL_TIME",
    structure: "THREE_WAY",
    subjectType: "EVENT",
    linePolicy: "FORBIDDEN",
    outcomeCodes: ["HOME", "DRAW", "AWAY"],
    settlementRuleVersion: "FOOTBALL_1X2_FULL_TIME_V1",
  }),
  FOOTBALL_FIRST_HALF_1X2: canonicalDefinition({
    code: "FOOTBALL_FIRST_HALF_1X2",
    sportCode: "FOOTBALL",
    familyCode: "MATCH_RESULT",
    periodCode: "FIRST_HALF",
    structure: "THREE_WAY",
    subjectType: "EVENT",
    linePolicy: "FORBIDDEN",
    outcomeCodes: ["HOME", "DRAW", "AWAY"],
    settlementRuleVersion: "FOOTBALL_1X2_FIRST_HALF_V1",
  }),
  FOOTBALL_FULL_TIME_TOTAL: canonicalDefinition({
    code: "FOOTBALL_FULL_TIME_TOTAL",
    sportCode: "FOOTBALL",
    familyCode: "TOTAL",
    periodCode: "FULL_TIME",
    structure: "TWO_WAY",
    subjectType: "EVENT",
    linePolicy: "REQUIRED",
    allowedLineIncrement: "HALF",
    outcomeCodes: ["OVER", "UNDER"],
    settlementRuleVersion: "FOOTBALL_TOTAL_2_5_FULL_TIME_V1",
  }),
  FOOTBALL_FULL_TIME_ASIAN_TOTAL: canonicalDefinition({
    code: "FOOTBALL_FULL_TIME_ASIAN_TOTAL",
    sportCode: "FOOTBALL",
    familyCode: "ASIAN_TOTAL",
    periodCode: "FULL_TIME",
    structure: "TWO_WAY",
    subjectType: "EVENT",
    linePolicy: "REQUIRED",
    allowedLineIncrement: "QUARTER",
    outcomeCodes: ["OVER", "UNDER"],
    settlementRuleVersion: "FOOTBALL_ASIAN_TOTAL_FULL_TIME_V1",
  }),
  FOOTBALL_FULL_TIME_ASIAN_HANDICAP: canonicalDefinition({
    code: "FOOTBALL_FULL_TIME_ASIAN_HANDICAP",
    sportCode: "FOOTBALL",
    familyCode: "ASIAN_HANDICAP",
    periodCode: "FULL_TIME",
    structure: "TWO_WAY",
    subjectType: "EVENT",
    linePolicy: "REQUIRED",
    allowedLineIncrement: "QUARTER",
    outcomeCodes: ["HOME", "AWAY"],
    settlementRuleVersion: "FOOTBALL_ASIAN_HANDICAP_FULL_TIME_V1",
  }),
  FOOTBALL_TEAM_TOTAL: canonicalDefinition({
    code: "FOOTBALL_TEAM_TOTAL",
    sportCode: "FOOTBALL",
    familyCode: "TEAM_TOTAL",
    periodCode: "FULL_TIME",
    structure: "TWO_WAY",
    subjectType: "TEAM",
    linePolicy: "REQUIRED",
    allowedLineIncrement: "HALF",
    outcomeCodes: ["OVER", "UNDER"],
    settlementRuleVersion: "FOOTBALL_TEAM_TOTAL_FULL_TIME_V1",
  }),
  FOOTBALL_PLAYER_SHOTS: canonicalDefinition({
    code: "FOOTBALL_PLAYER_SHOTS",
    sportCode: "FOOTBALL",
    familyCode: "PLAYER_SHOTS",
    periodCode: "FULL_TIME",
    structure: "TWO_WAY",
    subjectType: "PLAYER",
    linePolicy: "REQUIRED",
    allowedLineIncrement: "HALF",
    outcomeCodes: ["OVER", "UNDER"],
    settlementRuleVersion: "FOOTBALL_PLAYER_SHOTS_FULL_TIME_V1",
  }),
  FOOTBALL_PLAYER_SHOTS_ON_TARGET: canonicalDefinition({
    code: "FOOTBALL_PLAYER_SHOTS_ON_TARGET",
    sportCode: "FOOTBALL",
    familyCode: "PLAYER_SHOTS_ON_TARGET",
    periodCode: "FULL_TIME",
    structure: "TWO_WAY",
    subjectType: "PLAYER",
    linePolicy: "REQUIRED",
    allowedLineIncrement: "HALF",
    outcomeCodes: ["OVER", "UNDER"],
    settlementRuleVersion: "FOOTBALL_PLAYER_SHOTS_ON_TARGET_FULL_TIME_V1",
  }),
  FOOTBALL_GOALKEEPER_SAVES: canonicalDefinition({
    code: "FOOTBALL_GOALKEEPER_SAVES",
    sportCode: "FOOTBALL",
    familyCode: "GOALKEEPER_SAVES",
    periodCode: "FULL_TIME",
    structure: "TWO_WAY",
    subjectType: "PLAYER",
    linePolicy: "REQUIRED",
    allowedLineIncrement: "HALF",
    outcomeCodes: ["OVER", "UNDER"],
    settlementRuleVersion: "FOOTBALL_GOALKEEPER_SAVES_FULL_TIME_V1",
  }),
  FOOTBALL_ANYTIME_GOALSCORER: canonicalDefinition({
    code: "FOOTBALL_ANYTIME_GOALSCORER",
    sportCode: "FOOTBALL",
    familyCode: "ANYTIME_GOALSCORER",
    periodCode: "FULL_TIME",
    structure: "TWO_WAY",
    subjectType: "PLAYER",
    linePolicy: "FORBIDDEN",
    outcomeCodes: ["YES", "NO"],
    settlementRuleVersion: "FOOTBALL_ANYTIME_GOALSCORER_FULL_TIME_V1",
  }),
  FOOTBALL_PLAYER_CARD: canonicalDefinition({
    code: "FOOTBALL_PLAYER_CARD",
    sportCode: "FOOTBALL",
    familyCode: "PLAYER_CARD",
    periodCode: "FULL_TIME",
    structure: "TWO_WAY",
    subjectType: "PLAYER",
    linePolicy: "FORBIDDEN",
    outcomeCodes: ["YES", "NO"],
    settlementRuleVersion: "FOOTBALL_PLAYER_CARD_FULL_TIME_V1",
  }),
  FOOTBALL_CORNERS_HANDICAP: canonicalDefinition({
    code: "FOOTBALL_CORNERS_HANDICAP",
    sportCode: "FOOTBALL",
    familyCode: "CORNERS_HANDICAP",
    periodCode: "FULL_TIME",
    structure: "TWO_WAY",
    subjectType: "EVENT",
    linePolicy: "REQUIRED",
    allowedLineIncrement: "QUARTER",
    outcomeCodes: ["HOME", "AWAY"],
    settlementRuleVersion: "FOOTBALL_CORNERS_HANDICAP_FULL_TIME_V1",
  }),
});

function subjectMatchesDefinition(
  definition: MarketDefinition,
  subject: MarketSubject | undefined,
): boolean {
  if (definition.subjectType === "EVENT") return subject === undefined;

  if (definition.subjectType === "TEAM") {
    return (
      subject?.type === "TEAM" &&
      (subject.role === "HOME_TEAM" || subject.role === "AWAY_TEAM") &&
      typeof subject.id === "string"
    );
  }

  return (
    subject?.type === "PLAYER" &&
    subject.role === "NAMED_PLAYER" &&
    typeof subject.id === "string"
  );
}

export function createEventMarket(
  input: EventMarketInput,
): MarketSemanticsResult<EventMarket> {
  if (!input.definition || typeof input.eventId !== "string") {
    return failure(
      "INVALID_MARKET",
      "An event market requires a definition and event identifier.",
    );
  }

  const { definition, line, subject } = input;

  if (definition.linePolicy === "REQUIRED" && line === undefined) {
    return failure("LINE_REQUIRED", "This market definition requires a line.");
  }

  if (definition.linePolicy === "FORBIDDEN" && line !== undefined) {
    return failure(
      "LINE_FORBIDDEN",
      "This market definition does not allow a line.",
    );
  }

  if (
    line !== undefined &&
    (definition.allowedLineIncrement === undefined ||
      !lineMatchesIncrement(line, definition.allowedLineIncrement))
  ) {
    return failure(
      "UNSUPPORTED_LINE_INCREMENT",
      "The market line is not on this definition's allowed increment.",
    );
  }

  if (!subjectMatchesDefinition(definition, subject)) {
    return failure(
      "SUBJECT_MISMATCH",
      "The market subject does not match the definition scope.",
    );
  }

  return success(
    Object.freeze({
      kind: "EventMarket" as const,
      definition,
      eventId: input.eventId,
      ...(line === undefined ? {} : { line }),
      ...(subject === undefined ? {} : { subject }),
    }),
  );
}

export function createMarketOutcome(
  market: EventMarket,
  outcomeCode: string,
): MarketSemanticsResult<MarketOutcome> {
  if (
    !market?.definition ||
    !market.definition.outcomeCodes.includes(outcomeCode as MarketOutcomeCode)
  ) {
    return failure(
      "OUTCOME_NOT_ALLOWED",
      "The outcome is not declared by the market definition.",
    );
  }

  const subjectRole =
    market.subject?.role ?? requiredRole(market.definition.subjectType);
  const key = Object.freeze({
    kind: "MarketKey" as const,
    sportCode: market.definition.sportCode,
    familyCode: market.definition.familyCode,
    periodCode: market.definition.periodCode,
    structure: market.definition.structure,
    subjectType: market.definition.subjectType,
    subjectRole,
    ...(market.line === undefined ? {} : { line: market.line }),
    outcomeCode: outcomeCode as MarketOutcomeCode,
    settlementRuleVersion: market.definition.settlementRuleVersion,
  });

  return success(
    Object.freeze({
      kind: "MarketOutcome" as const,
      eventMarket: market,
      outcomeCode: outcomeCode as MarketOutcomeCode,
      key,
    }),
  );
}

export function serializeMarketKey(key: MarketKey): string {
  return [
    "market-key-v1",
    `sport=${key.sportCode}`,
    `family=${key.familyCode}`,
    `period=${key.periodCode}`,
    `structure=${key.structure}`,
    `subject=${key.subjectType}:${key.subjectRole}`,
    `line=${key.line?.value ?? "-"}`,
    `outcome=${key.outcomeCode}`,
    `rule=${key.settlementRuleVersion}`,
  ].join("|");
}

export type SettlementStatus =
  "WIN" | "LOSS" | "PUSH" | "HALF_WIN" | "HALF_LOSS" | "VOID" | "UNSETTLED";
export type EventResultStatus =
  "FINAL" | "IN_PROGRESS" | "ABANDONED" | "POSTPONED" | "CANCELLED";

export type SettlementRule = Readonly<{
  readonly version: string;
  readonly periodBoundary: "REGULATION_90_MINUTES" | "FIRST_HALF";
  readonly includesExtraTime: boolean;
  readonly includesShootout: boolean;
  readonly pushBehavior: "NOT_APPLICABLE" | "PUSH";
  readonly halfOutcomeBehavior: "NOT_APPLICABLE" | "ASIAN_SPLIT";
  readonly voidConditions: readonly EventResultStatus[];
  readonly abandonedPostponedBehavior: "VOID";
  readonly participationRule: "NOT_APPLICABLE" | "MUST_PARTICIPATE";
  readonly sourceStatistic: "REGULATION_SCORE" | "UNSPECIFIED";
  readonly resultResolver: "SYNTHETIC_FOOTBALL_RESULT" | "FUTURE_RESOLVER";
  readonly validResultStatuses: readonly EventResultStatus[];
}>;

export const settlementRules: readonly SettlementRule[] = Object.freeze([
  Object.freeze({
    version: "FOOTBALL_1X2_FULL_TIME_V1",
    periodBoundary: "REGULATION_90_MINUTES",
    includesExtraTime: false,
    includesShootout: false,
    pushBehavior: "NOT_APPLICABLE",
    halfOutcomeBehavior: "NOT_APPLICABLE",
    voidConditions: Object.freeze<EventResultStatus[]>([
      "ABANDONED",
      "POSTPONED",
      "CANCELLED",
    ]),
    abandonedPostponedBehavior: "VOID",
    participationRule: "NOT_APPLICABLE",
    sourceStatistic: "REGULATION_SCORE",
    resultResolver: "SYNTHETIC_FOOTBALL_RESULT",
    validResultStatuses: Object.freeze<EventResultStatus[]>(["FINAL"]),
  }),
  Object.freeze({
    version: "FOOTBALL_TOTAL_2_5_FULL_TIME_V1",
    periodBoundary: "REGULATION_90_MINUTES",
    includesExtraTime: false,
    includesShootout: false,
    pushBehavior: "NOT_APPLICABLE",
    halfOutcomeBehavior: "NOT_APPLICABLE",
    voidConditions: Object.freeze<EventResultStatus[]>([
      "ABANDONED",
      "POSTPONED",
      "CANCELLED",
    ]),
    abandonedPostponedBehavior: "VOID",
    participationRule: "NOT_APPLICABLE",
    sourceStatistic: "REGULATION_SCORE",
    resultResolver: "SYNTHETIC_FOOTBALL_RESULT",
    validResultStatuses: Object.freeze<EventResultStatus[]>(["FINAL"]),
  }),
]);

type ExecutableMarketBinding = Readonly<{
  readonly ruleVersion: string;
  readonly sportCode: SportCode;
  readonly familyCode: MarketFamilyCode;
  readonly periodCode: PeriodCode;
  readonly structure: MarketStructure;
  readonly subjectType: SubjectType;
  readonly subjectRole: SubjectRole;
  readonly linePolicy: LinePolicy;
  readonly allowedLineIncrement?: LineIncrement;
  readonly lineValue?: "2.5";
  readonly outcomeCodes: readonly MarketOutcomeCode[];
}>;

const executableMarketBindings: readonly ExecutableMarketBinding[] =
  Object.freeze([
    Object.freeze({
      ruleVersion: "FOOTBALL_1X2_FULL_TIME_V1",
      sportCode: "FOOTBALL",
      familyCode: "MATCH_RESULT",
      periodCode: "FULL_TIME",
      structure: "THREE_WAY",
      subjectType: "EVENT",
      subjectRole: "NONE",
      linePolicy: "FORBIDDEN",
      outcomeCodes: Object.freeze<MarketOutcomeCode[]>([
        "HOME",
        "DRAW",
        "AWAY",
      ]),
    }),
    Object.freeze({
      ruleVersion: "FOOTBALL_TOTAL_2_5_FULL_TIME_V1",
      sportCode: "FOOTBALL",
      familyCode: "TOTAL",
      periodCode: "FULL_TIME",
      structure: "TWO_WAY",
      subjectType: "EVENT",
      subjectRole: "NONE",
      linePolicy: "REQUIRED",
      allowedLineIncrement: "HALF",
      lineValue: "2.5",
      outcomeCodes: Object.freeze<MarketOutcomeCode[]>(["OVER", "UNDER"]),
    }),
  ]);

export type SettlementInput = Readonly<{
  readonly status: EventResultStatus;
  readonly homeScore?: number;
  readonly awayScore?: number;
}>;

export type SettlementResult =
  | Readonly<{
      readonly kind: "SETTLED";
      readonly status: SettlementStatus;
      readonly ruleVersion: string;
    }>
  | Readonly<{
      readonly kind: "UNSUPPORTED";
      readonly error: Readonly<{
        readonly code: "UNSUPPORTED_SETTLEMENT" | "INVALID_RESULT";
        readonly message: string;
      }>;
    }>;

function settled(
  status: SettlementStatus,
  ruleVersion: string,
): SettlementResult {
  return Object.freeze({ kind: "SETTLED", status, ruleVersion });
}

function unsupported(
  code: "UNSUPPORTED_SETTLEMENT" | "INVALID_RESULT",
  message: string,
): SettlementResult {
  return Object.freeze({
    kind: "UNSUPPORTED",
    error: Object.freeze({ code, message }),
  });
}

function finalScores(
  input: SettlementInput,
): readonly [number, number] | undefined {
  const { homeScore, awayScore } = input;

  if (
    !Number.isInteger(homeScore) ||
    !Number.isInteger(awayScore) ||
    homeScore === undefined ||
    awayScore === undefined ||
    homeScore < 0 ||
    awayScore < 0
  ) {
    return undefined;
  }

  return [homeScore, awayScore];
}

function executableRule(version: string):
  | Readonly<{
      readonly rule: SettlementRule;
      readonly binding: ExecutableMarketBinding;
    }>
  | undefined {
  const rule = settlementRules.find(
    (settlementRule) => settlementRule.version === version,
  );
  const binding = executableMarketBindings.find(
    (marketBinding) => marketBinding.ruleVersion === version,
  );

  return rule === undefined || binding === undefined
    ? undefined
    : { rule, binding };
}

function exactOutcomeSet(
  actual: readonly MarketOutcomeCode[],
  expected: readonly MarketOutcomeCode[],
): boolean {
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);

  return (
    actualSet.size === actual.length &&
    expectedSet.size === expected.length &&
    actualSet.size === expectedSet.size &&
    [...actualSet].every((outcomeCode) => expectedSet.has(outcomeCode)) &&
    [...expectedSet].every((outcomeCode) => actualSet.has(outcomeCode))
  );
}

function isValidMarketLine(value: unknown): value is MarketLine {
  if (
    typeof value !== "object" ||
    value === null ||
    !("kind" in value) ||
    !("value" in value) ||
    value.kind !== "MarketLine" ||
    typeof value.value !== "string"
  ) {
    return false;
  }

  return marketLine(value.value).ok;
}

function matchesLineBinding(
  keyLine: unknown,
  eventLine: unknown,
  binding: ExecutableMarketBinding,
): boolean {
  const keyHasLine = keyLine !== undefined;
  const eventHasLine = eventLine !== undefined;

  if (binding.lineValue === undefined) {
    return !keyHasLine && !eventHasLine;
  }

  return (
    keyHasLine &&
    eventHasLine &&
    isValidMarketLine(keyLine) &&
    isValidMarketLine(eventLine) &&
    keyLine.value === binding.lineValue &&
    eventLine.value === binding.lineValue
  );
}

function matchesExecutableMarket(
  outcome: MarketOutcome,
  binding: ExecutableMarketBinding,
): boolean {
  const { definition, line, subject } = outcome.eventMarket;
  const { key } = outcome;

  return (
    definition.sportCode === binding.sportCode &&
    definition.familyCode === binding.familyCode &&
    definition.periodCode === binding.periodCode &&
    definition.structure === binding.structure &&
    definition.subjectType === binding.subjectType &&
    definition.linePolicy === binding.linePolicy &&
    definition.allowedLineIncrement === binding.allowedLineIncrement &&
    definition.settlementRuleVersion === binding.ruleVersion &&
    exactOutcomeSet(definition.outcomeCodes, binding.outcomeCodes) &&
    subject === undefined &&
    key.sportCode === binding.sportCode &&
    key.familyCode === binding.familyCode &&
    key.periodCode === binding.periodCode &&
    key.structure === binding.structure &&
    key.subjectType === binding.subjectType &&
    key.subjectRole === binding.subjectRole &&
    key.settlementRuleVersion === binding.ruleVersion &&
    key.outcomeCode === outcome.outcomeCode &&
    binding.outcomeCodes.includes(outcome.outcomeCode) &&
    matchesLineBinding(key.line, line, binding)
  );
}

export function settleMarket(
  outcome: MarketOutcome,
  input: SettlementInput,
): SettlementResult {
  const executable = executableRule(outcome.key.settlementRuleVersion);

  if (
    executable === undefined ||
    !matchesExecutableMarket(outcome, executable.binding)
  ) {
    return unsupported(
      "UNSUPPORTED_SETTLEMENT",
      `Settlement rule ${outcome.key.settlementRuleVersion} is not executable in Phase 1.`,
    );
  }

  const { rule } = executable;

  if (rule.voidConditions.includes(input.status)) {
    return settled("VOID", rule.version);
  }

  if (input.status !== "FINAL") {
    return settled("UNSETTLED", rule.version);
  }

  const scores = finalScores(input);

  if (scores === undefined) {
    return unsupported(
      "INVALID_RESULT",
      "A final result requires non-negative integer scores.",
    );
  }

  const [homeScore, awayScore] = scores;

  if (rule.version === "FOOTBALL_1X2_FULL_TIME_V1") {
    const winningOutcome =
      homeScore > awayScore
        ? "HOME"
        : homeScore === awayScore
          ? "DRAW"
          : "AWAY";
    return settled(
      outcome.outcomeCode === winningOutcome ? "WIN" : "LOSS",
      rule.version,
    );
  }

  const isOver = homeScore + awayScore > 2;
  const winningOutcome = isOver ? "OVER" : "UNDER";
  return settled(
    outcome.outcomeCode === winningOutcome ? "WIN" : "LOSS",
    rule.version,
  );
}
