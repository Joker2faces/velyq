import {
  decimalOdds,
  parseDecimalString,
  type DecimalResult,
  type DecimalString,
} from "@velyq/decimal";

/**
 * Removing the bookmaker's overround (vig) from a set of decimal odds, and
 * aggregating that into a single market consensus with real, honest
 * uncertainty bounds.
 *
 * Deliberately **not** decimal-string arithmetic throughout. `@velyq/decimal`
 * exists to keep ledger and settlement amounts exact — money and prices
 * that must never accumulate floating-point drift. A de-vig calculation is
 * not that: it is a probability *estimate* derived from market prices, and
 * the power and Shin methods below require iterative root-finding
 * (bisection) that decimal-string arithmetic has no primitive for. Standard
 * industry practice for this exact calculation is IEEE double precision,
 * which carries far more resolution than any bookmaker's quoted price does.
 * Every public function still accepts and returns `DecimalString`: the
 * boundary is crossed internally and closed again before anything leaves
 * this module, so nothing downstream needs to know the difference.
 *
 * Three de-vig methods are implemented because they encode different
 * assumptions about *why* the overround exists, and picking the wrong one
 * silently biases the "fair" probability:
 *
 *   - **Multiplicative**: assumes the bookmaker inflates every outcome's
 *     implied probability by the same proportional factor. The simplest
 *     assumption, exact in closed form, and a reasonable default when
 *     nothing more is known about the book's pricing behaviour.
 *   - **Power**: assumes the overround grows with how *unlikely* an outcome
 *     is (a bookmaker protecting a favourite less than a long shot) — each
 *     implied probability is raised to a shared exponent `k`, solved so the
 *     results sum to 1. Requires bisection.
 *   - **Shin (1992/1993)**: models the overround as bookmakers protecting
 *     against better-informed bettors ("insider" trading), parameterised by
 *     an insider fraction `z`. Also requires bisection, and is the method
 *     most robust when favourite-longshot bias is pronounced.
 *
 * None of these produces a probability more "true" than the market itself —
 * they only answer "what would this market imply if it charged no vig",
 * which is the honest ceiling on what market evidence alone can tell VELYQ.
 */

// -------------------------------------------------------- odds -> implied

function toNumberOdds(value: DecimalString): number {
  return Number(value);
}

function impliedFromOdds(odds: readonly number[]): number[] {
  return odds.map((o) => 1 / o);
}

function toDecimalStrings(
  values: readonly number[],
): DecimalResult<readonly DecimalString[]> {
  const parsed: DecimalString[] = [];
  for (const value of values) {
    // 10 significant decimal places is far beyond what any bookmaker's
    // quoted price resolves to; it exists only so the round-trip through a
    // fixed-point string does not itself introduce visible rounding.
    const fixed = value.toFixed(10).replace(/0+$/, "").replace(/\.$/, "");
    const result = parseDecimalString(fixed === "" ? "0" : fixed);
    if (!result.ok) return result;
    parsed.push(result.value);
  }
  return { ok: true, value: parsed };
}

export type DevigMethod = "MULTIPLICATIVE" | "POWER" | "SHIN";

export type DevigResult = Readonly<{
  method: DevigMethod;
  /** De-vigged probabilities, in the same order as the input odds, summing
      to 1 (within floating-point tolerance). */
  probabilities: readonly DecimalString[];
  /** The overround the raw odds implied before de-vigging (e.g. "0.05" for
      a 5% book margin). Always >= 0 for a legitimate two-way or more market;
      a negative value means the input odds do not represent a real book
      (arbitrage or malformed data) and the caller should treat the market as
      untrustworthy rather than use the result. */
  overround: DecimalString;
}>;

function validateOdds(
  odds: readonly DecimalString[],
): DecimalResult<readonly number[]> {
  if (odds.length < 2) {
    return {
      ok: false,
      error: {
        code: "OUT_OF_RANGE",
        message: "Need at least two outcomes to de-vig a market.",
      },
    };
  }
  const numbers: number[] = [];
  for (const value of odds) {
    const checked = decimalOdds(value);
    if (!checked.ok) return checked;
    numbers.push(toNumberOdds(value));
  }
  return { ok: true, value: numbers };
}

/**
 * Multiplicative de-vig: each implied probability divided by the sum of all
 * implied probabilities. Exact, closed-form, no iteration.
 */
export function devigMultiplicative(
  odds: readonly DecimalString[],
): DecimalResult<DevigResult> {
  const parsed = validateOdds(odds);
  if (!parsed.ok) return parsed;
  const implied = impliedFromOdds(parsed.value);
  const sum = implied.reduce((a, b) => a + b, 0);
  const fair = implied.map((p) => p / sum);
  const probabilities = toDecimalStrings(fair);
  if (!probabilities.ok) return probabilities;
  const overround = toDecimalStrings([sum - 1]);
  if (!overround.ok) return overround;
  return {
    ok: true,
    value: {
      method: "MULTIPLICATIVE",
      probabilities: probabilities.value,
      overround: overround.value[0]!,
    },
  };
}

/**
 * Power de-vig. Solves for `k` such that `sum(implied_i ^ k) = 1` via
 * bisection, then returns `implied_i ^ k` for each outcome.
 *
 * `k >= 1` always holds for a market with a genuine (positive) overround:
 * `k = 1` reproduces the raw implied probabilities (which sum to more than
 * 1, by definition of an overround), and increasing `k` shrinks every term
 * — each `implied_i` is in `(0, 1)`, so raising it to a larger power moves it
 * closer to 0 — so there is exactly one `k` in `[1, ∞)` where the terms sum
 * to exactly 1. Bisection is bounded and always converges for this reason.
 */
export function devigPower(
  odds: readonly DecimalString[],
): DecimalResult<DevigResult> {
  const parsed = validateOdds(odds);
  if (!parsed.ok) return parsed;
  const implied = impliedFromOdds(parsed.value);
  const rawSum = implied.reduce((a, b) => a + b, 0);
  if (rawSum <= 1) {
    return {
      ok: false,
      error: {
        code: "OUT_OF_RANGE",
        message:
          "Odds imply zero or negative overround; not a de-vig-able book.",
      },
    };
  }
  const sumAtK = (k: number) => implied.reduce((sum, p) => sum + p ** k, 0);
  let low = 1;
  let high = 64; // generous ceiling; real bookmaker overrounds never need this
  for (let iteration = 0; iteration < 200 && sumAtK(high) > 1; iteration += 1) {
    high *= 2;
  }
  for (let iteration = 0; iteration < 200; iteration += 1) {
    const mid = (low + high) / 2;
    if (sumAtK(mid) > 1) low = mid;
    else high = mid;
  }
  const k = (low + high) / 2;
  const fair = implied.map((p) => p ** k);
  const probabilities = toDecimalStrings(fair);
  if (!probabilities.ok) return probabilities;
  const overround = toDecimalStrings([rawSum - 1]);
  if (!overround.ok) return overround;
  return {
    ok: true,
    value: {
      method: "POWER",
      probabilities: probabilities.value,
      overround: overround.value[0]!,
    },
  };
}

/**
 * Shin (1992/1993) de-vig. Solves for the insider-trading fraction `z` such
 * that the resulting probabilities sum to 1, via the closed-form-per-`z`
 * relation:
 *
 *   p_i(z) = ( sqrt(z^2 + 4(1-z) * π_i^2 / S) - z ) / (2(1-z))
 *
 * where `π_i` is outcome `i`'s raw implied probability and `S = sum(π_i)`.
 * `z` is bounded in `[0, 1)`: `z = 0` reproduces the multiplicative-like raw
 * shrink and increasing `z` further separates favourites from longshots.
 * Solved by bisection on `z` for the same reason as the power method: the
 * sum is monotonic in `z` over the valid range.
 */
export function devigShin(
  odds: readonly DecimalString[],
): DecimalResult<DevigResult> {
  const parsed = validateOdds(odds);
  if (!parsed.ok) return parsed;
  const implied = impliedFromOdds(parsed.value);
  const rawSum = implied.reduce((a, b) => a + b, 0);
  if (rawSum <= 1) {
    return {
      ok: false,
      error: {
        code: "OUT_OF_RANGE",
        message:
          "Odds imply zero or negative overround; not a de-vig-able book.",
      },
    };
  }
  const shinProbabilities = (z: number) =>
    implied.map((p) => {
      const radicand = z * z + (4 * (1 - z) * (p * p)) / rawSum;
      return (Math.sqrt(Math.max(radicand, 0)) - z) / (2 * (1 - z));
    });
  const sumAtZ = (z: number) => shinProbabilities(z).reduce((a, b) => a + b, 0);
  let low = 0;
  let high = 0.999999;
  // sumAtZ(0) equals rawSum (> 1, since we validated a real overround) and
  // sumAtZ approaches a value <= 1 as z -> 1, so the root lies in between.
  for (let iteration = 0; iteration < 200; iteration += 1) {
    const mid = (low + high) / 2;
    if (sumAtZ(mid) > 1) low = mid;
    else high = mid;
  }
  const z = (low + high) / 2;
  const fair = shinProbabilities(z);
  const probabilities = toDecimalStrings(fair);
  if (!probabilities.ok) return probabilities;
  const overround = toDecimalStrings([rawSum - 1]);
  if (!overround.ok) return overround;
  return {
    ok: true,
    value: {
      method: "SHIN",
      probabilities: probabilities.value,
      overround: overround.value[0]!,
    },
  };
}

export function devig(
  method: DevigMethod,
  odds: readonly DecimalString[],
): DecimalResult<DevigResult> {
  if (method === "MULTIPLICATIVE") return devigMultiplicative(odds);
  if (method === "POWER") return devigPower(odds);
  return devigShin(odds);
}

// -------------------------------------------------- market consensus

export type BookmakerQuote = Readonly<{
  bookmaker: string;
  /** Decimal odds for each outcome, in a fixed, market-wide outcome order. */
  odds: readonly DecimalString[];
  /** When this price was observed. Used only for `freshnessSeconds` below;
      the consensus itself is unweighted by recency because averaging in a
      stale price with a fresh one would misrepresent the market as more
      certain than it currently is — a caller should drop stale quotes
      before calling this, not rely on it to discount them. */
  observedAt: string;
}>;

export type MarketConsensus = Readonly<{
  method: DevigMethod;
  /** De-vigged probability for each outcome, averaged across bookmakers. */
  probabilities: readonly DecimalString[];
  /** Per-outcome lower bound: the minimum de-vigged probability any single
      bookmaker implied. This is what a market-side "robust" comparison
      should use — the most conservative reading the market actually
      offered, not an invented confidence interval. */
  probabilitiesLow: readonly DecimalString[];
  /** Per-outcome upper bound: the maximum de-vigged probability any single
      bookmaker implied. */
  probabilitiesHigh: readonly DecimalString[];
  /** Per-outcome dispersion: high - low. A market where every book agrees
      closely has low dispersion and is more trustworthy than one where
      books disagree widely, independent of how many books there are. */
  dispersion: readonly DecimalString[];
  /** How many bookmaker quotes contributed. */
  bookmakerCoverage: number;
  /** Seconds between the earliest and latest quote used, as a coarse
      freshness signal — not a claim about how current the market is right
      now, only about how synchronized the inputs were. */
  observationSpreadSeconds: number;
}>;

/**
 * Builds one market consensus from multiple bookmakers' quotes for the same
 * market.
 *
 * Deliberately does **not** average raw odds — averaging prices before
 * removing each book's own vig conflates "what the market thinks" with "how
 * much margin each book independently charges", which biases the result
 * toward whichever book has the largest margin. Each bookmaker's odds are
 * de-vigged independently first; only the resulting *probabilities* are
 * then averaged.
 */
export function marketConsensus(
  quotes: readonly BookmakerQuote[],
  method: DevigMethod = "MULTIPLICATIVE",
): DecimalResult<MarketConsensus> {
  if (quotes.length === 0) {
    return {
      ok: false,
      error: { code: "OUT_OF_RANGE", message: "No bookmaker quotes supplied." },
    };
  }
  const outcomeCount = quotes[0]!.odds.length;
  if (quotes.some((quote) => quote.odds.length !== outcomeCount)) {
    return {
      ok: false,
      error: {
        code: "OUT_OF_RANGE",
        message: "All bookmaker quotes must cover the same outcome set.",
      },
    };
  }
  const perBookmaker: number[][] = [];
  for (const quote of quotes) {
    const devigged = devig(method, quote.odds);
    if (!devigged.ok) return devigged;
    perBookmaker.push(devigged.value.probabilities.map(Number));
  }
  const average: number[] = [];
  const low: number[] = [];
  const high: number[] = [];
  for (let outcome = 0; outcome < outcomeCount; outcome += 1) {
    const perOutcome = perBookmaker.map((book) => book[outcome]!);
    average.push(perOutcome.reduce((a, b) => a + b, 0) / perOutcome.length);
    low.push(Math.min(...perOutcome));
    high.push(Math.max(...perOutcome));
  }
  const probabilities = toDecimalStrings(average);
  const probabilitiesLow = toDecimalStrings(low);
  const probabilitiesHigh = toDecimalStrings(high);
  const dispersion = toDecimalStrings(high.map((h, index) => h - low[index]!));
  if (!probabilities.ok) return probabilities;
  if (!probabilitiesLow.ok) return probabilitiesLow;
  if (!probabilitiesHigh.ok) return probabilitiesHigh;
  if (!dispersion.ok) return dispersion;
  const timestamps = quotes.map((quote) => Date.parse(quote.observedAt));
  const observationSpreadSeconds =
    (Math.max(...timestamps) - Math.min(...timestamps)) / 1000;
  return {
    ok: true,
    value: {
      method,
      probabilities: probabilities.value,
      probabilitiesLow: probabilitiesLow.value,
      probabilitiesHigh: probabilitiesHigh.value,
      dispersion: dispersion.value,
      bookmakerCoverage: quotes.length,
      observationSpreadSeconds,
    },
  };
}
