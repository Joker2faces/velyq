import {
  createDatabaseClient,
  DatabaseCustomerQueryAdapter,
} from "@velyq/database";
import type { CustomerRawMatch, CustomerRawToday } from "@velyq/database";
import type { CustomerMatchDto, CustomerTodayDto } from "@velyq/contracts";
import { SYNTHETIC_DATA_LABEL } from "@velyq/contracts";
import type { DecimalString } from "@velyq/decimal";

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
  const outcome = raw.outcomes[0];
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
  const lineup = "EXPECTED" as CustomerMatchDto["lineup"];
  const modelProbability = decimal(prediction?.prediction.modelProbability);
  const recommendation = (prediction?.prediction.decisionStatus ??
    "INSUFFICIENT_DATA") as CustomerMatchDto["recommendation"];
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
    movementPercent: null,
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
      maturity: "EXPERIMENTAL",
      calibrationVersion: prediction?.run.calibrationVersionId ?? "unknown",
      scoreVersion: score?.result.scoreDefinitionVersionId ?? "unknown",
      featureCutoff:
        prediction?.run.featureCutoff.toISOString() ?? raw.asOf.toISOString(),
    },
  };
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
