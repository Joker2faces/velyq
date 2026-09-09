import { DatabaseCustomerQueryAdapter } from "@velyq/database";
import type { CustomerRawMatch, CustomerRawToday } from "@velyq/database";
import type {
  CustomerMatchDto,
  CustomerScenarioDto,
  CustomerTodayDto,
} from "@velyq/contracts";
import {
  LIVE_DATA_LABEL,
  MARKET_DATA_UNAVAILABLE_LABEL,
  SYNTHETIC_DATA_LABEL,
  type CustomerDataLabel,
} from "@velyq/contracts";
import {
  numericColumnToDecimalString,
  type DecimalString,
} from "@velyq/decimal";
import { summariseOddsMovement } from "@velyq/application/odds-movement";
import { assessOddsFreshness } from "@velyq/application/odds-freshness";
import { evaluatePriceValidity } from "@velyq/analytics/price-validity";
import { configuredDataMode } from "./data-mode";
import { openRuntimeDatabaseSession } from "./runtime-database/runtime-database";

/**
 * Reads a PostgreSQL NUMERIC column into a validated decimal.
 *
 * The previous implementation cast the driver's string straight to
 * `DecimalString`. That is not a no-op: NUMERIC(18,8) arrives scale-padded
 * ("1.30000000"), which the decimal parser rejects as non-canonical, so every
 * arithmetic operation on a real database price failed. The failures became
 * nulls, and the nulls were rendered to customers as facts -- "Price
 * unchanged" for a market that had moved. Canonicalising on read is what the
 * decimal package documents as "the pairing to use on every column read".
 */
const decimal = (value: string | null | undefined): DecimalString | null => {
  if (value == null) return null;
  const parsed = numericColumnToDecimalString(value);
  return parsed.ok ? parsed.value : null;
};

function scenarioFor(
  eventId: string,
  recommendation: CustomerMatchDto["recommendation"],
  lineup: CustomerMatchDto["lineup"],
): CustomerScenarioDto {
  const state =
    recommendation === "WAIT"
      ? lineup === "CHANGED"
        ? "CHANGED_LINEUP"
        : lineup === "OFFICIAL"
          ? "OFFICIAL_LINEUP"
          : "EXPECTED_LINEUP"
      : recommendation;
  return {
    id: `customer:${eventId}:${state.toLowerCase()}`,
    state,
    label: state
      .toLowerCase()
      .replaceAll("_", " ")
      .replace(/^./, (letter) => letter.toUpperCase()),
  };
}

/**
 * Whether this match's prices came from a real market or a demo scenario.
 *
 * Read from the observations themselves — `isSynthetic` on the stored odds —
 * rather than from any flag on the event. The observation is the thing a
 * customer would actually stake against, so it is the thing whose provenance
 * decides the label.
 *
 * A match with no observations is explicitly unavailable. It must not be
 * relabelled as a demo scenario or as a live price that does not exist.
 */
function dataLabelFor(raw: CustomerRawMatch): CustomerDataLabel {
  const observations = raw.outcomes.flatMap((outcome) => outcome.odds);
  if (observations.length === 0) return MARKET_DATA_UNAVAILABLE_LABEL;
  return observations.some((observation) => observation.isSynthetic)
    ? SYNTHETIC_DATA_LABEL
    : LIVE_DATA_LABEL;
}

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
  /*
   * Opening, current and movement all come from one place that understands
   * observation *times*. Taking `odds[0]` and `odds.at(-1)` compared the
   * first and last row of a list that holds one row per bookmaker per
   * instant, so a single provider response looked like a price that had
   * moved between two bookmakers' quotes.
   */
  const movementSummary = summariseOddsMovement(odds);
  const opening = movementSummary.openingOdds;
  const current = movementSummary.currentOdds;
  const prediction = outcome?.prediction;
  const quality = outcome?.quality;
  const score = outcome?.score;
  /*
   * Freshness is judged by the shared policy rather than a local hour-long
   * rule, so the boundary a customer is shown is the same one the decision
   * engine acts on. It is measured on the provider's own observation time --
   * when the market was seen, not when we happened to store it.
   */
  const latestObservation =
    odds.length === 0
      ? null
      : new Date(Math.max(...odds.map((o) => o.providerObservedAt.getTime())));
  const stale = !assessOddsFreshness(latestObservation, raw.asOf).actionable;
  const lineup = deriveLineupState(raw);
  const modelProbability = decimal(prediction?.prediction.modelProbability);
  /*
   * The authoritative price-validity assessment, evaluated here rather than
   * in a view. A surface was computing its own watch threshold as
   * `Number(fairOdds) * 1.03` -- a margin the product never agreed, in
   * floating point, on a value the decision engine had not endorsed. This
   * module owns the policy and its version, so every surface quotes the same
   * number and can say which policy produced it.
   */
  const priceValidity = evaluatePriceValidity({
    modelProbability,
    currentOdds: current,
  });
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
    syntheticLabel: dataLabelFor(raw),
    scenario: scenarioFor(raw.event.id, recommendation, lineup),
    freshness: stale ? "STALE" : "FRESH",
    /*
     * The canonical outcome code ("HOME"), not the stored `labelKey`
     * ("outcome.home"). The label key is an internal identifier and had no
     * entry in the presentation map, so it fell through and reached
     * customers verbatim. Storage is unchanged; only what crosses the
     * boundary is.
     */
    selection: outcome?.outcomeDefinition.code ?? "—",
    recommendation,
    modelProbability,
    impliedProbability: decimal(
      prediction?.prediction.marketImpliedProbability,
    ),
    fairOdds: decimal(prediction?.prediction.fairOdds),
    currentOdds: decimal(current),
    openingOdds: decimal(opening),
    movementPercent: movementSummary.movementPercent,
    movementState: movementSummary.state,
    probabilityEdge: decimal(prediction?.prediction.edge),
    expectedValue: decimal(prediction?.prediction.expectedValue),
    priceValidity: {
      status: priceValidity.status,
      policyVersion: priceValidity.policyVersion,
      breakEvenOdds: priceValidity.breakEvenOdds,
      minimumAcceptableOdds: priceValidity.minimumAcceptableOdds,
    },
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
      /*
       * Synthetic wins if any single match on the page is synthetic. A page
       * labelled live that contains one invented price is the more dangerous
       * of the two errors, so the label degrades pessimistically.
       */
      syntheticLabel: raw.matches.some(
        (match) => dataLabelFor(match) === SYNTHETIC_DATA_LABEL,
      )
        ? SYNTHETIC_DATA_LABEL
        : raw.matches.every(
              (match) => dataLabelFor(match) === MARKET_DATA_UNAVAILABLE_LABEL,
            )
          ? MARKET_DATA_UNAVAILABLE_LABEL
          : LIVE_DATA_LABEL,
      asOf: raw.asOf.toISOString(),
      matches: raw.matches.map(mapMatch),
    };
  },
  mapMatch,
};

export interface RuntimeCustomerQueries {
  readonly queries: DatabaseCustomerQueryAdapter;
  close(): Promise<void>;
}

export async function openDatabaseCustomerQueries(): Promise<RuntimeCustomerQueries | null> {
  const session = await openRuntimeDatabaseSession();
  if (!session) return null;

  return {
    /*
     * The adapter needs to know which corpus this deployment is allowed to
     * read, and `configuredDataMode()` is the single authority for that --
     * the same one `customerService()` branches on, so the query and the
     * service can never disagree about whether synthetic fixtures count.
     */
    queries: new DatabaseCustomerQueryAdapter(session.database, {
      dataOrigin: configuredDataMode(),
    }),
    close: () => session.close(),
  };
}
