import { decimalOdds, parseDecimalString, type DecimalString } from "@velyq/decimal";
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

function toDecimal(value: number): DecimalString | null {
  const fixed = value.toFixed(10).replace(/0+$/, "").replace(/\.$/, "");
  const result = parseDecimalString(fixed === "" ? "0" : fixed);
  return result.ok ? result.value : null;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
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
      const quotes: Readonly<{ bookmakerId: string; odds: number }>[] = [];
      for (const [bookmakerId, outcomeOdds] of byBookmaker) {
        const odds = outcomeOdds.get(outcomeCode);
        if (odds !== undefined) quotes.push({ bookmakerId, odds: Number(odds) });
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
      const med = median(values);
      if (quotes.length - 1 >= OUTLIER_MINIMUM_PEER_QUOTES) {
        for (const quote of quotes) {
          const deviation = (quote.odds - med) / med;
          if (Math.abs(deviation) > OUTLIER_DEVIATION_THRESHOLD) {
            const medianDecimal = toDecimal(med);
            const deviationDecimal = toDecimal(deviation);
            if (medianDecimal && deviationDecimal) {
              outlierCandidates.push({
                bookmakerId: quote.bookmakerId,
                outcomeCode,
                decimalOdds: toDecimal(quote.odds) ?? ("0" as DecimalString),
                medianOdds: medianDecimal,
                deviationRatio: deviationDecimal,
              });
            }
          }
        }
      }
      return {
        outcomeCode,
        bestOdds: toDecimal(Math.max(...values)),
        medianOdds: toDecimal(med),
        minOdds: toDecimal(Math.min(...values)),
        maxOdds: toDecimal(Math.max(...values)),
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
