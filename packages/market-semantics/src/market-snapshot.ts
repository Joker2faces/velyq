import {
  addDecimalStrings,
  compareDecimalStrings,
  decimalOdds,
  divideDecimalStrings,
  subtractDecimalStrings,
  type DecimalString,
} from "@velyq/decimal";
import {
  marketConsensus,
  type BookmakerQuote,
  type DevigMethod,
  type MarketConsensus,
} from "./devig.js";

/**
 * Turning raw, per-bookmaker odds observations into one coherent market
 * snapshot -- the shared representation Market Consensus, Market Map and
 * Risk Flags all read from.
 *
 * The one rule this whole module exists to enforce: a consensus is built
 * from observations that were actually simultaneous, never from whichever
 * rows happen to be newest per outcome independently. API-Sports reports a
 * single `update` instant for an entire odds document -- every bookmaker,
 * every market, every outcome in one fetch shares the identical
 * `providerObservedAt` -- so grouping by that exact timestamp recovers
 * "everything the provider reported as one snapshot" without needing a
 * synthetic tolerance window. A bookmaker whose observations at that
 * instant do not cover every required outcome is not silently completed
 * with a stale price from an earlier instant -- it is excluded from
 * consensus and reported only as a partial/best-price contributor.
 */

export type RawBookmakerObservation = Readonly<{
  bookmakerId: string;
  outcomeCode: string;
  decimalOdds: DecimalString;
  /** The provider's own observation instant, ISO 8601. */
  providerObservedAt: string;
}>;

export type OutlierCandidate = Readonly<{
  bookmakerId: string;
  outcomeCode: string;
  decimalOdds: DecimalString;
  medianOdds: DecimalString;
  /** (decimalOdds - medianOdds) / medianOdds, signed. */
  deviationRatio: DecimalString;
}>;

export type MarketSnapshotOutcome = Readonly<{
  outcomeCode: string;
  /** Highest decimal odds on offer -- the best price a bettor could take. */
  bestOdds: DecimalString | null;
  medianOdds: DecimalString | null;
  minOdds: DecimalString | null;
  maxOdds: DecimalString | null;
  /** Distinct bookmakers quoting this outcome at the snapshot instant. */
  bookmakerCount: number;
}>;

export type MarketSnapshot = Readonly<{
  /** The coherent instant this snapshot was built from. */
  observedAt: string;
  requiredOutcomes: readonly string[];
  outcomes: readonly MarketSnapshotOutcome[];
  /** Distinct bookmakers with ANY observation at this instant, complete or not. */
  bookmakerCount: number;
  /** Bookmakers whose observations at this instant cover every required outcome. */
  completeBookmakerCount: number;
  /** Null whenever no bookmaker's book was complete -- never a fabricated
      consensus from a partial one. */
  consensus: MarketConsensus | null;
  outlierCandidates: readonly OutlierCandidate[];
}>;

/**
 * Outlier detection policy: a bookmaker's price is a candidate outlier when
 * at least this many OTHER bookmakers quote the same outcome (an "outlier"
 * needs peers to be measured against) and its deviation from the median
 * exceeds this fraction. Versioned like every other policy in this
 * codebase -- values are a product decision, not incidental constants.
 */
export const ODDS_OUTLIER_POLICY_VERSION = "odds-outlier-policy.v1";
const OUTLIER_MINIMUM_PEER_QUOTES = 3;
const OUTLIER_DEVIATION_THRESHOLD = 0.15;

/** Exact ascending sort of decimal-string values -- no float conversion. */
function sortDecimals(values: readonly DecimalString[]): DecimalString[] {
  return [...values].sort((a, b) => {
    const comparison = compareDecimalStrings(a, b);
    return comparison.ok ? comparison.value : 0;
  });
}

/**
 * Exact decimal median. Even-length inputs average the two middle values
 * via decimal add/divide, never a float mean.
 */
function medianDecimal(values: readonly DecimalString[]): DecimalString {
  const sorted = sortDecimals(values);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 !== 0) return sorted[mid]!;
  const lower = sorted[mid - 1]!;
  const upper = sorted[mid]!;
  const sum = addDecimalStrings(lower, upper);
  if (!sum.ok) return lower;
  const halved = divideDecimalStrings(sum.value, "2" as DecimalString);
  return halved.ok ? halved.value : lower;
}

/** (value - median) / median, computed with exact decimal arithmetic. */
function deviationRatio(
  value: DecimalString,
  medianValue: DecimalString,
): DecimalString | null {
  const difference = subtractDecimalStrings(value, medianValue);
  if (!difference.ok) return null;
  const ratio = divideDecimalStrings(difference.value, medianValue);
  return ratio.ok ? ratio.value : null;
}

/**
 * Builds one coherent market snapshot from every observation available
 * (across all instants) for one event market, as of `asOf`.
 *
 * Returns null when there is nothing to build from at all -- no
 * observation at or before `asOf` -- which is a real, honest state (a
 * market with no evidence yet), not an error.
 */
export function buildMarketSnapshot(
  observations: readonly RawBookmakerObservation[],
  requiredOutcomes: readonly string[],
  options: Readonly<{ asOf?: Date; method?: DevigMethod }> = {},
): MarketSnapshot | null {
  const asOf = options.asOf ?? null;
  const eligible = asOf
    ? observations.filter(
        (observation) =>
          Date.parse(observation.providerObservedAt) <= asOf.getTime(),
      )
    : observations;
  if (eligible.length === 0) return null;

  /*
   * Grouped by the provider's own instant, never by which row happened to
   * be inserted last -- the same discipline `summariseOddsMovement` already
   * applies to opening/current prices, applied here to which observations
   * are even eligible to sit in the same snapshot.
   */
  const byInstant = new Map<number, RawBookmakerObservation[]>();
  for (const observation of eligible) {
    const at = Date.parse(observation.providerObservedAt);
    if (!Number.isFinite(at)) continue;
    byInstant.set(at, [...(byInstant.get(at) ?? []), observation]);
  }
  if (byInstant.size === 0) return null;
  const latestInstant = Math.max(...byInstant.keys());
  const rows = byInstant.get(latestInstant)!;

  /* bookmakerId -> outcomeCode -> odds, for exactly this one instant. */
  const byBookmaker = new Map<string, Map<string, DecimalString>>();
  for (const row of rows) {
    const parsed = decimalOdds(row.decimalOdds);
    if (!parsed.ok) continue;
    const outcomes = byBookmaker.get(row.bookmakerId) ?? new Map();
    outcomes.set(row.outcomeCode, row.decimalOdds);
    byBookmaker.set(row.bookmakerId, outcomes);
  }

  const outlierCandidates: OutlierCandidate[] = [];
  const outcomes: MarketSnapshotOutcome[] = requiredOutcomes.map(
    (outcomeCode) => {
      const quotes: Readonly<{ bookmakerId: string; odds: DecimalString }>[] =
        [];
      for (const [bookmakerId, outcomeOdds] of byBookmaker) {
        const odds = outcomeOdds.get(outcomeCode);
        if (odds !== undefined) quotes.push({ bookmakerId, odds });
      }
      if (quotes.length === 0) {
        return {
          outcomeCode,
          bestOdds: null,
          medianOdds: null,
          minOdds: null,
          maxOdds: null,
          bookmakerCount: 0,
        };
      }
      const values = quotes.map((quote) => quote.odds);
      const sorted = sortDecimals(values);
      const min = sorted[0]!;
      const max = sorted[sorted.length - 1]!;
      const med = medianDecimal(values);
      /*
       * Every comparison and arithmetic step here -- ordering, the median,
       * the deviation ratio -- runs on exact decimal strings via
       * @velyq/decimal, never a `Number()` cast: odds are the authoritative
       * customer-facing number this module exists to produce, so float
       * precision loss is not an acceptable source of error here even
       * though realistic odds strings rarely trigger it in practice.
       */
      if (quotes.length - 1 >= OUTLIER_MINIMUM_PEER_QUOTES) {
        for (const quote of quotes) {
          const deviation = deviationRatio(quote.odds, med);
          if (deviation === null) continue;
          const magnitude =
            deviation.startsWith("-") ? deviation.slice(1) : deviation;
          const exceeds = compareDecimalStrings(
            magnitude as DecimalString,
            String(OUTLIER_DEVIATION_THRESHOLD) as DecimalString,
          );
          if (exceeds.ok && exceeds.value > 0) {
            outlierCandidates.push({
              bookmakerId: quote.bookmakerId,
              outcomeCode,
              decimalOdds: quote.odds,
              medianOdds: med,
              deviationRatio: deviation,
            });
          }
        }
      }
      return {
        outcomeCode,
        bestOdds: max,
        medianOdds: med,
        minOdds: min,
        maxOdds: max,
        bookmakerCount: quotes.length,
      };
    },
  );

  const completeBookmakers: BookmakerQuote[] = [];
  for (const [bookmakerId, outcomeOdds] of byBookmaker) {
    if (requiredOutcomes.every((code) => outcomeOdds.has(code))) {
      completeBookmakers.push({
        bookmaker: bookmakerId,
        odds: requiredOutcomes.map((code) => outcomeOdds.get(code)!),
        observedAt: new Date(latestInstant).toISOString(),
      });
    }
  }

  const consensusResult =
    completeBookmakers.length > 0
      ? marketConsensus(completeBookmakers, options.method ?? "MULTIPLICATIVE")
      : null;

  return {
    observedAt: new Date(latestInstant).toISOString(),
    requiredOutcomes,
    outcomes,
    bookmakerCount: byBookmaker.size,
    completeBookmakerCount: completeBookmakers.length,
    consensus: consensusResult?.ok ? consensusResult.value : null,
    outlierCandidates,
  };
}
