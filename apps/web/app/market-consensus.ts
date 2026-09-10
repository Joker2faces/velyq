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
import {
  compareDecimalStrings,
  numericColumnToDecimalString,
  parseDecimalString,
  type DecimalString,
} from "@velyq/decimal";
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
export type CustomerMarketConsensusResult = Readonly<{
  dto: CustomerMarketConsensusDto | undefined;
  /** Outcome codes with at least one outlier-candidate bookmaker price at
      the snapshot instant -- used only to derive OUTLIER_PRICE, never
      rendered with a bookmaker identity. */
  outlierOutcomeCodes: ReadonlySet<string>;
}>;

export function buildCustomerMarketConsensus(
  raw: CustomerRawMatch,
  marketCode: string,
  requiredOutcomes: readonly string[],
): CustomerMarketConsensusResult {
  const empty: CustomerMarketConsensusResult = {
    dto: undefined,
    outlierOutcomeCodes: new Set(),
  };
  const marketOutcomes = raw.outcomes.filter(
    (outcome) => outcome.marketDefinition.code === marketCode,
  );
  if (marketOutcomes.length === 0) return empty;

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
  if (!snapshot) return empty;

  const freshnessAssessment = assessOddsFreshness(
    new Date(snapshot.observedAt),
    raw.asOf,
  );

  const dto: CustomerMarketConsensusDto = {
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

  return {
    dto,
    outlierOutcomeCodes: new Set(
      snapshot.outlierCandidates.map((candidate) => candidate.outcomeCode),
    ),
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
const HIGH_DISPERSION_THRESHOLD_DECIMAL = parseDecimalString("0.08");
if (!HIGH_DISPERSION_THRESHOLD_DECIMAL.ok)
  throw new Error("HIGH_DISPERSION_THRESHOLD_DECIMAL is not canonical");
const HIGH_DISPERSION_THRESHOLD: DecimalString =
  HIGH_DISPERSION_THRESHOLD_DECIMAL.value;

/**
 * Real, evidence-derived risk flags -- never a fabricated confidence score.
 * Every flag here names a specific, checkable condition already computed
 * elsewhere (freshness, quality reason codes, lineup state, market
 * consensus, movement history); this only decides which of those already-
 * real facts rise to the level of a flag worth surfacing together.
 *
 * Per-flag documentation (mandate §12: data source / threshold / policy
 * version / why it matters / when it clears). All thresholds below are
 * versioned as `RISK_FLAG_POLICY_VERSION` (`@velyq/contracts`); none of
 * these flags ever override the Decision Engine's own verdict -- they are
 * explanatory context alongside it, never a silent substitute for it.
 *
 * - STALE_MARKET / AGING_MARKET -- source: `assessOddsFreshness` (elapsed
 *   time since the market snapshot's own provider instant vs. kickoff).
 *   Mutually exclusive by construction (an `if`/`else if`). Clears the
 *   instant a fresher snapshot is observed.
 * - WAITING_FOR_LINEUP -- source: the event's own lineup state
 *   (`EXPECTED`/`OFFICIAL`/`MISSING`/`CHANGED`). Clears once a lineup
 *   sheet, official or provisional, is observed.
 * - MODEL_EXPERIMENTAL -- source: the model's own maturity flag, currently
 *   always `EXPERIMENTAL` for every model version in production (mandate
 *   §3: never promoted on sample size alone). Clears only when a model
 *   version is explicitly promoted, a decision made outside this function.
 * - IDENTITY_UNCERTAIN -- source: `qualityReasonCodes` containing
 *   `LOW_MAPPING_CONFIDENCE` (a real quality-assessment reason code written
 *   elsewhere in the pipeline, not derived here). Clears when quality
 *   assessment no longer emits that code for the event.
 * - INSUFFICIENT_HISTORY -- source: `movementState ===
 *   "INSUFFICIENT_HISTORY"` (too few price observations to know whether the
 *   market has moved at all). Clears once enough odds history exists to
 *   compute a real movement state.
 * - MARKET_CONSENSUS_UNAVAILABLE -- source: `buildMarketSnapshot`'s own
 *   `completeBookmakerCount` (no bookmaker's book was complete across every
 *   required outcome at the snapshot instant, or there is no market
 *   snapshot at all). Not merely "few bookmakers" -- see
 *   LOW_MARKET_COVERAGE for that. Clears the moment any bookmaker reports a
 *   complete book at a later instant.
 * - LOW_MARKET_COVERAGE -- source: `marketConsensus.bookmakerCount`
 *   (distinct bookmakers with ANY observation at the snapshot instant,
 *   complete or not) `< MINIMUM_BOOKMAKER_COVERAGE` (3). Independent of
 *   MARKET_CONSENSUS_UNAVAILABLE: coverage can be low while a consensus
 *   still exists (a handful of complete books), or coverage can be
 *   plentiful while none of them are complete -- both facts are reported
 *   when both are true, which is complementary, not contradictory. Clears
 *   once 3 or more bookmakers quote the outcome at the same instant.
 * - HIGH_BOOKMAKER_DISPERSION -- source: the *selected outcome's own*
 *   consensus `dispersion` value (only defined when a consensus exists --
 *   see `buildCustomerMarketConsensus`, which leaves `dispersion` null
 *   whenever `snapshot.consensus` is null), compared via exact decimal
 *   arithmetic (`compareDecimalStrings`, never a float cast) against
 *   `HIGH_DISPERSION_THRESHOLD` (0.08). Because `dispersion` is only ever
 *   non-null when a real consensus was computed, this can never fire
 *   alongside MARKET_CONSENSUS_UNAVAILABLE for the same outcome -- verified
 *   by construction, not by a runtime guard. Clears once bookmaker prices
 *   for the selected outcome converge back under the threshold.
 * - OUTLIER_PRICE -- source: `buildMarketSnapshot`'s own
 *   `outlierCandidates` (a price is a candidate only with at least 3 peer
 *   quotes to measure it against -- see `ODDS_OUTLIER_POLICY_VERSION`),
 *   restricted to whether the *currently selected* outcome has one. Clears
 *   once that outcome's price is back within the outlier-detection
 *   tolerance of its peers.
 */
export function deriveRiskFlags(input: {
  freshness: CustomerOddsFreshness;
  qualityReasonCodes: readonly string[];
  lineup: "EXPECTED" | "OFFICIAL" | "MISSING" | "CHANGED";
  movementState: "MOVED" | "UNCHANGED" | "INSUFFICIENT_HISTORY";
  modelMaturity: "EXPERIMENTAL";
  marketConsensus: CustomerMarketConsensusDto | undefined;
  currentSelection: string;
  outlierOutcomeCodes?: ReadonlySet<string>;
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
    if (selected?.dispersion !== null && selected?.dispersion !== undefined) {
      const comparison = compareDecimalStrings(
        selected.dispersion,
        HIGH_DISPERSION_THRESHOLD,
      );
      if (comparison.ok && comparison.value > 0) {
        flags.push("HIGH_BOOKMAKER_DISPERSION");
      }
    }
  }

  if (input.outlierOutcomeCodes?.has(input.currentSelection)) {
    flags.push("OUTLIER_PRICE");
  }

  return flags;
}
