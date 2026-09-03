import type { DecimalOdds, MarketLine, Probability } from "@velyq/decimal";

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
    readonly contentHash: string;
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
    readonly playerLabels: readonly string[];
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
    readonly contentHash: string;
  }>;

export type FixtureObservationBatch =
  NormalizedObservationBatch<NormalizedFixtureObservation>;
export type OddsObservationBatch =
  NormalizedObservationBatch<NormalizedOddsObservation>;
export type LineupObservationBatch =
  NormalizedObservationBatch<NormalizedLineupObservation>;

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
  listOddsObservations(request: ReplayRequest): Promise<OddsObservationBatch>;
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
      readonly policyVersion: string;
      readonly reason:
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
  }>;

export type SyntheticReplayResult = SyntheticMetadata &
  Readonly<{
    readonly sequenceName: string;
    readonly fixturePath: string;
    readonly contentHash: string;
    readonly scenarioStates: readonly ScenarioState[];
    readonly fixtures: FixtureObservationBatch;
    readonly odds: OddsObservationBatch;
    readonly lineups: LineupObservationBatch;
    readonly quarantined: readonly QuarantinedProviderObservation[];
  }>;
