import type { CustomerRawMatch } from "@velyq/database";
import type {
  CustomerMarketConsensusDto,
  CustomerOddsFreshness,
  CustomerRiskFlag,
} from "@velyq/contracts";
import {
  buildMarketSnapshot,
  type RawBookmakerObservation,
} from "@velyq/market-semantics";
import { numericColumnToDecimalString, type DecimalString } from "@velyq/decimal";
import { assessOddsFreshness } from "@velyq/application/odds-freshness";

const decimal = (value: string | null): DecimalString | null => {
  if (value === null) return null;
  const parsed = numericColumnToDecimalString(value);
  return parsed.ok ? parsed.value : null;
};

/**
 * The Market Map for one market of a fixture: every bookmaker's complete
 * book, de-vigged and averaged where enough of them are complete, built
 * from one coherent provider instant (see `buildMarketSnapshot`).
 *
 * `raw.outcomes` already carries, per outcome, every bookmaker's odds
 * observation with its own `bookmakerId` and `providerObservedAt` -- this
 * only regroups outcomes that share the same market code into one flat
 * observation list, it reads no new data.
 */
export function buildCustomerMarketConsensus(
  raw: CustomerRawMatch,
  marketCode: string,
  requiredOutcomes: readonly string[],
): CustomerMarketConsensusDto | undefined {
  const marketOutcomes = raw.outcomes.filter(
    (outcome) => outcome.marketDefinition.code === marketCode,
  );
  if (marketOutcomes.length === 0) return undefined;

  const observations: RawBookmakerObservation[] = marketOutcomes.flatMap(
    (outcome) =>
      outcome.odds.flatMap((observation) => {
        const parsed = numericColumnToDecimalString(observation.decimalOdds);
        if (!parsed.ok) return [];
        return [
          {
            bookmakerId: observation.bookmakerId,
            outcomeCode: outcome.outcomeDefinition.code,
            decimalOdds: parsed.value,
            providerObservedAt: observation.providerObservedAt.toISOString(),
          },
        ];
      }),
  );

  const snapshot = buildMarketSnapshot(observations, requiredOutcomes, {
    asOf: raw.asOf,
  });
  if (!snapshot) return undefined;

  const freshnessAssessment = assessOddsFreshness(
    new Date(snapshot.observedAt),
    raw.asOf,
  );

  return {
    observedAt: snapshot.observedAt,
    freshness: freshnessAssessment.freshness,
    method: snapshot.consensus?.method ?? "MULTIPLICATIVE",
    bookmakerCount: snapshot.bookmakerCount,
    completeBookmakerCount: snapshot.completeBookmakerCount,
    outcomes: requiredOutcomes.map((outcomeCode, index) => {
      const outcome = snapshot.outcomes.find(
        (candidate) => candidate.outcomeCode === outcomeCode,
      );
      return {
        outcomeCode,
        bestOdds: outcome?.bestOdds ?? null,
        medianOdds: outcome?.medianOdds ?? null,
        minOdds: outcome?.minOdds ?? null,
        maxOdds: outcome?.maxOdds ?? null,
        bookmakerCount: outcome?.bookmakerCount ?? 0,
        consensusProbability: decimal(
          snapshot.consensus?.probabilities[index] ?? null,
        ),
        consensusProbabilityLow: decimal(
          snapshot.consensus?.probabilitiesLow[index] ?? null,
        ),
        consensusProbabilityHigh: decimal(
          snapshot.consensus?.probabilitiesHigh[index] ?? null,
        ),
        dispersion: decimal(snapshot.consensus?.dispersion[index] ?? null),
      };
    }),
  };
}

/**
 * How much bookmaker disagreement counts as a real risk flag, and how few
 * bookmakers counts as low coverage. Versioned (`RISK_FLAG_POLICY_VERSION`
 * in `@velyq/contracts`) like every other threshold-bearing policy in this
 * codebase -- a product decision, tested at its boundary, not an incidental
 * constant.
 */
const MINIMUM_BOOKMAKER_COVERAGE = 3;
const HIGH_DISPERSION_THRESHOLD = 0.08;

/**
 * Real, evidence-derived risk flags -- never a fabricated confidence score.
 * Every flag here names a specific, checkable condition already computed
 * elsewhere (freshness, quality reason codes, lineup state, market
 * consensus, movement history); this only decides which of those already-
 * real facts rise to the level of a flag worth surfacing together.
 */
export function deriveRiskFlags(input: {
  freshness: CustomerOddsFreshness;
  qualityReasonCodes: readonly string[];
  lineup: "EXPECTED" | "OFFICIAL" | "MISSING" | "CHANGED";
  movementState: "MOVED" | "UNCHANGED" | "INSUFFICIENT_HISTORY";
  modelMaturity: "EXPERIMENTAL";
  marketConsensus: CustomerMarketConsensusDto | undefined;
  currentSelection: string;
}): readonly CustomerRiskFlag[] {
  const flags: CustomerRiskFlag[] = [];

  if (input.freshness === "STALE" || input.freshness === "UNAVAILABLE") {
    flags.push("STALE_MARKET");
  } else if (input.freshness === "AGING") {
    flags.push("AGING_MARKET");
  }

  if (input.lineup === "MISSING") flags.push("WAITING_FOR_LINEUP");

  if (input.modelMaturity === "EXPERIMENTAL") flags.push("MODEL_EXPERIMENTAL");

  if (input.qualityReasonCodes.includes("LOW_MAPPING_CONFIDENCE")) {
    flags.push("IDENTITY_UNCERTAIN");
  }

  if (input.movementState === "INSUFFICIENT_HISTORY") {
    flags.push("INSUFFICIENT_HISTORY");
  }

  if (
    input.marketConsensus === undefined ||
    input.marketConsensus.completeBookmakerCount === 0
  ) {
    flags.push("MARKET_CONSENSUS_UNAVAILABLE");
  }
  if (input.marketConsensus !== undefined) {
    if (input.marketConsensus.bookmakerCount < MINIMUM_BOOKMAKER_COVERAGE) {
      flags.push("LOW_MARKET_COVERAGE");
    }
    const selected = input.marketConsensus.outcomes.find(
      (outcome) => outcome.outcomeCode === input.currentSelection,
    );
    if (
      selected?.dispersion !== null &&
      selected?.dispersion !== undefined &&
      Number(selected.dispersion) > HIGH_DISPERSION_THRESHOLD
    ) {
      flags.push("HIGH_BOOKMAKER_DISPERSION");
    }
  }

  return flags;
}
