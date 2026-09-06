import {
  addDecimalStrings,
  decimalOdds,
  divideDecimalStrings,
  subtractDecimalStrings,
  type DecimalString,
} from "@velyq/decimal";

export const NO_VIG_NORMALIZATION_VERSION = "no-vig.v1" as const;

export type MarketKind = "1X2" | "TWO_WAY";

export type MarketOddsObservation = Readonly<{
  readonly bookmaker: string;
  readonly outcome: string;
  readonly odds: string;
}>;

export type MarketConsensusInput = Readonly<{
  readonly market: MarketKind;
  readonly observations: readonly MarketOddsObservation[];
}>;

export type MarketConsensusOutcome = Readonly<{
  readonly outcome: string;
  readonly rawImpliedProbability: DecimalString;
  readonly normalizedImpliedProbability: DecimalString;
  readonly normalizedProbabilitySum: DecimalString;
  readonly bestOdds: DecimalString;
  readonly medianOdds: DecimalString;
  readonly minOdds: DecimalString;
  readonly maxOdds: DecimalString;
  readonly dispersion: DecimalString;
  readonly bookmakerCount: number;
  readonly agreement: DecimalString;
  readonly outlierCandidate: boolean;
}>;

export type MarketConsensus = Readonly<{
  readonly market: MarketKind;
  readonly normalizationVersion: typeof NO_VIG_NORMALIZATION_VERSION;
  readonly overround: DecimalString | null;
  readonly bookmakerCount: number;
  readonly outcomes: readonly MarketConsensusOutcome[];
  readonly reasonCodes: readonly string[];
}>;

type ValidBook = Readonly<{
  readonly bookmaker: string;
  readonly values: ReadonlyMap<string, DecimalString>;
  readonly rawImplied: ReadonlyMap<string, DecimalString>;
  readonly normalized: ReadonlyMap<string, DecimalString>;
  readonly overround: DecimalString;
}>;

const ONE = "1" as DecimalString;
const OUTLIER_DISTANCE = "0.1" as DecimalString;

function outcomesFor(market: MarketKind): readonly string[] {
  return market === "1X2" ? ["HOME", "DRAW", "AWAY"] : ["OVER", "UNDER"];
}

function compareDecimal(left: DecimalString, right: DecimalString): number {
  const difference = subtractDecimalStrings(left, right);
  if (!difference.ok || difference.value === ("0" as DecimalString)) return 0;
  return difference.value.startsWith("-") ? -1 : 1;
}

function sum(values: readonly DecimalString[]): DecimalString | null {
  let total = "0" as DecimalString;
  for (const value of values) {
    const result = addDecimalStrings(total, value);
    if (!result.ok) return null;
    total = result.value;
  }
  return total;
}

function average(values: readonly DecimalString[]): DecimalString | null {
  const total = sum(values);
  const count = String(values.length) as DecimalString;
  if (!total || values.length === 0) return null;
  const result = divideDecimalStrings(total, count);
  return result.ok ? result.value : null;
}

function median(values: readonly DecimalString[]): DecimalString | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort(compareDecimal);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle]!;
  return average([sorted[middle - 1]!, sorted[middle]!]);
}

function absolute(value: DecimalString): DecimalString {
  return (value.startsWith("-") ? value.slice(1) : value) as DecimalString;
}

function freezeConsensus(
  market: MarketKind,
  overround: DecimalString | null,
  books: number,
  outcomes: readonly MarketConsensusOutcome[],
  reasonCodes: readonly string[],
): MarketConsensus {
  return Object.freeze({
    market,
    normalizationVersion: NO_VIG_NORMALIZATION_VERSION,
    overround,
    bookmakerCount: books,
    outcomes: Object.freeze([...outcomes]),
    reasonCodes: Object.freeze([...reasonCodes]),
  });
}

/** Builds a provider-neutral, proportional no-vig consensus for one complete market. */
export function calculateMarketConsensus(
  input: MarketConsensusInput,
): MarketConsensus {
  const expectedOutcomes = outcomesFor(input.market);
  const grouped = new Map<string, Map<string, DecimalString>>();
  const invalidBooks = new Set<string>();
  const reasonCodes: string[] = [];

  for (const observation of input.observations) {
    const odds = decimalOdds(observation.odds);
    if (!odds.ok) {
      invalidBooks.add(observation.bookmaker);
      if (!reasonCodes.includes("INVALID_ODDS"))
        reasonCodes.push("INVALID_ODDS");
      continue;
    }
    const outcomes = grouped.get(observation.bookmaker) ?? new Map();
    if (outcomes.has(observation.outcome)) {
      invalidBooks.add(observation.bookmaker);
      if (!reasonCodes.includes("DUPLICATE_BOOKMAKER_OBSERVATION"))
        reasonCodes.push("DUPLICATE_BOOKMAKER_OBSERVATION");
      continue;
    }
    outcomes.set(observation.outcome, odds.value.value);
    grouped.set(observation.bookmaker, outcomes);
  }

  const books: ValidBook[] = [];
  for (const [bookmaker, values] of grouped) {
    if (
      invalidBooks.has(bookmaker) ||
      !expectedOutcomes.every((outcome) => values.has(outcome)) ||
      values.size !== expectedOutcomes.length
    ) {
      if (!reasonCodes.includes("INSUFFICIENT_MARKET_OUTCOMES"))
        reasonCodes.push("INSUFFICIENT_MARKET_OUTCOMES");
      continue;
    }
    const raw = new Map<string, DecimalString>();
    for (const outcome of expectedOutcomes) {
      const implied = divideDecimalStrings(ONE, values.get(outcome)!);
      if (!implied.ok) break;
      raw.set(outcome, implied.value);
    }
    const overround = sum([...raw.values()]);
    if (raw.size !== expectedOutcomes.length || !overround) {
      if (!reasonCodes.includes("INSUFFICIENT_MARKET_OUTCOMES"))
        reasonCodes.push("INSUFFICIENT_MARKET_OUTCOMES");
      continue;
    }
    const normalized = new Map<string, DecimalString>();
    for (const outcome of expectedOutcomes) {
      const value = divideDecimalStrings(raw.get(outcome)!, overround);
      if (!value.ok) break;
      normalized.set(outcome, value.value);
    }
    if (normalized.size !== expectedOutcomes.length) continue;
    books.push(
      Object.freeze({
        bookmaker,
        values,
        rawImplied: raw,
        normalized,
        overround,
      }),
    );
  }

  if (books.length === 0) {
    if (!reasonCodes.includes("INSUFFICIENT_MARKET_OUTCOMES"))
      reasonCodes.push("INSUFFICIENT_MARKET_OUTCOMES");
    return freezeConsensus(input.market, null, 0, [], reasonCodes);
  }

  const consensusOverround = median(books.map((book) => book.overround));
  const normalizedProbabilitySum = sum(
    expectedOutcomes.map((outcome) =>
      average(books.map((book) => book.normalized.get(outcome)!))!,
    ),
  )!;
  const outcomes = expectedOutcomes.map((outcome): MarketConsensusOutcome => {
    const odds = books.map((book) => book.values.get(outcome)!);
    const raw = books.map((book) => book.rawImplied.get(outcome)!);
    const normalized = books.map((book) => book.normalized.get(outcome)!);
    const medianOdds = median(odds)!;
    const minOdds = [...odds].sort(compareDecimal)[0]!;
    const maxOdds = [...odds].sort(compareDecimal).at(-1)!;
    const dispersion = subtractDecimalStrings(maxOdds, minOdds);
    const medianNormalized = median(normalized)!;
    const deviations = normalized.map((value) => {
      const difference = subtractDecimalStrings(value, medianNormalized);
      return difference.ok
        ? absolute(difference.value)
        : ("0" as DecimalString);
    });
    const outlierCount = deviations.filter(
      (value) => compareDecimal(value, OUTLIER_DISTANCE) > 0,
    ).length;
    const agreement = divideDecimalStrings(
      String(normalized.length - outlierCount) as DecimalString,
      String(normalized.length) as DecimalString,
    );
    return Object.freeze({
      outcome,
      rawImpliedProbability: average(raw)!,
      normalizedImpliedProbability: average(normalized)!,
      normalizedProbabilitySum,
      bestOdds: maxOdds,
      medianOdds,
      minOdds,
      maxOdds,
      dispersion: dispersion.ok ? dispersion.value : ("0" as DecimalString),
      bookmakerCount: books.length,
      agreement: agreement.ok ? agreement.value : ("0" as DecimalString),
      outlierCandidate: outlierCount > 0,
    });
  });
  return freezeConsensus(
    input.market,
    consensusOverround,
    books.length,
    outcomes,
    reasonCodes,
  );
}
