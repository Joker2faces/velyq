import {
  createDatabaseClient,
  DatabaseCustomerQueryAdapter,
} from "@velyq/database";
import type { CustomerRawMatch, CustomerRawToday } from "@velyq/database";
import type { CustomerMatchDto, CustomerTodayDto } from "@velyq/contracts";
import { SYNTHETIC_DATA_LABEL } from "@velyq/contracts";
import {
  divideDecimalStrings,
  subtractDecimalStrings,
  type DecimalString,
} from "@velyq/decimal";

const decimal = (value: string | null | undefined) =>
  value == null ? null : (value as DecimalString);

function mapMatch(raw: CustomerRawMatch): CustomerMatchDto {
  const home =
    raw.participants.find(
      ({ eventParticipant }) => eventParticipant.role === "HOME",
    )?.participant.displayName ?? "Home";
  const away =
    raw.participants.find(
      ({ eventParticipant }) => eventParticipant.role === "AWAY",
    )?.participant.displayName ?? "Away";
  const outcome = selectOutcome(raw);
  const odds = outcome?.odds ?? [];
  const opening = odds[0]?.decimalOdds ?? null;
  const current = odds.at(-1)?.decimalOdds ?? null;
  const prediction = outcome?.prediction;
  const quality = outcome?.quality;
  const score = outcome?.score;
  const latestObservation = odds.at(-1)?.providerObservedAt;
  const stale = latestObservation
    ? raw.asOf.getTime() - latestObservation.getTime() > 60 * 60 * 1000
    : true;
  const lineup = deriveLineupState(raw);
  const movementDelta =
    opening !== null && current !== null
      ? subtractDecimalStrings(
          current as DecimalString,
          opening as DecimalString,
        )
      : null;
  const movement =
    movementDelta?.ok && opening !== null
      ? divideDecimalStrings(movementDelta.value, opening as DecimalString)
      : null;
  const modelProbability = decimal(prediction?.prediction.modelProbability);
  const recommendation = (prediction?.prediction.decisionStatus ??
    "INSUFFICIENT_DATA") as CustomerMatchDto["recommendation"];
  const sourceObservationIds =
    outcome?.predictionInputs.map((input) => input.sourceObservationId) ?? [];
  return {
    eventId: raw.event.id,
    homeTeam: home,
    awayTeam: away,
    competition: raw.competition.nameKey,
    startsAt: raw.event.startsAt.toISOString(),
    syntheticLabel: SYNTHETIC_DATA_LABEL,
    freshness: stale ? "STALE" : "FRESH",
    selection: outcome?.outcomeDefinition.labelKey ?? "—",
    recommendation,
    modelProbability,
    impliedProbability: decimal(
      prediction?.prediction.marketImpliedProbability,
    ),
    fairOdds: decimal(prediction?.prediction.fairOdds),
    currentOdds: decimal(current),
    openingOdds: decimal(opening),
    movementPercent: movement?.ok ? movement.value : null,
    probabilityEdge: decimal(prediction?.prediction.edge),
    expectedValue: decimal(prediction?.prediction.expectedValue),
    lineup,
    quality: {
      grade: quality?.grade ?? "F",
      score: decimal(quality?.numericScore) ?? ("0" as DecimalString),
      policyVersion: quality?.policyVersionId ?? "unknown",
      reasonCodes: quality?.reasonCodes ?? ["INSUFFICIENT_DATA"],
    },
    trace: {
      modelVersion: prediction?.run.modelVersionId ?? "unknown",
      modelDefinitionVersion: "phase-1-experimental.v1",
      maturity: "EXPERIMENTAL",
      calibrationVersion: prediction?.run.calibrationVersionId ?? "unknown",
      calibrationDefinitionVersion: "identity.v1",
      scoreVersion: score?.result.scoreDefinitionVersionId ?? "unknown",
      ...(score
        ? {
            scoreDefinitionCode: score.radarEvidence
              ? "PHASE_1_RADAR"
              : "PHASE_1_EDGE",
            scoreWeights: score.result.weights as Record<string, unknown>,
            scoreCapsPenalties: score.result.capsPenalties as Record<
              string,
              unknown
            >,
          }
        : {}),
      featureCutoff:
        prediction?.run.featureCutoff.toISOString() ?? raw.asOf.toISOString(),
      sourceObservationIds,
      ...(prediction ? { providerRunId: prediction.run.id } : {}),
      ...(prediction
        ? {
            marketPriceObservationId:
              prediction.prediction.marketPriceObservationId,
          }
        : {}),
      ...(quality ? { qualityAssessmentId: quality.id } : {}),
    },
  };
}

/** Prefer the canonical match-result market and the outcome with persisted evidence. */
export function selectOutcome(raw: CustomerRawMatch) {
  return (
    raw.outcomes.find(
      ({ marketDefinition, prediction, score }) =>
        (marketDefinition.code === "MATCH_RESULT" ||
          marketDefinition.code === "1X2") &&
        (prediction !== null || score !== null),
    ) ??
    raw.outcomes.find(
      ({ prediction, score }) => prediction !== null || score !== null,
    ) ??
    raw.outcomes[0]
  );
}

export function deriveLineupState(
  raw: CustomerRawMatch,
): CustomerMatchDto["lineup"] {
  const latestByTeam = new Map<string, (typeof raw.lineups)[number]>();
  for (const lineup of raw.lineups) {
    const existing = latestByTeam.get(lineup.teamParticipantId);
    if (
      !existing ||
      lineup.providerObservedAt.getTime() >
        existing.providerObservedAt.getTime()
    ) {
      latestByTeam.set(lineup.teamParticipantId, lineup);
    }
  }
  const statuses = [...latestByTeam.values()].map(
    (item) => item.status as string,
  );
  if (statuses.length === 0 || statuses.includes("UNAVAILABLE"))
    return "MISSING";
  if (statuses.includes("CHANGED")) return "CHANGED";
  if (statuses.every((status) => status === "OFFICIAL")) return "OFFICIAL";
  return "EXPECTED";
}

export const customerDatabaseMapper = {
  mapToday(raw: CustomerRawToday): CustomerTodayDto {
    return {
      syntheticLabel: SYNTHETIC_DATA_LABEL,
      asOf: raw.asOf.toISOString(),
      matches: raw.matches.map(mapMatch),
    };
  },
  mapMatch,
};

let adapter: DatabaseCustomerQueryAdapter | null = null;
export function databaseCustomerQueries() {
  const connectionString = process.env["VELYQ_DATABASE_URL"];
  if (!connectionString) return null;
  adapter ??= new DatabaseCustomerQueryAdapter(
    createDatabaseClient({ connectionString }).database,
  );
  return adapter;
}
