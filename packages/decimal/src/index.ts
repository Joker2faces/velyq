import { Decimal } from "decimal.js";

/**
 * Generic inputs allow at most 36 significant digits and 30 fractional digits.
 * Precision 80 exceeds the largest exact intermediate public helper result.
 */
const DecimalRuntime = Decimal.clone({
  precision: 80,
  rounding: Decimal.ROUND_HALF_EVEN,
  toExpNeg: -1_000_000,
  toExpPos: 1_000_000,
});

const CANONICAL_DECIMAL =
  /^(?:(?:0|[1-9]\d*|-[1-9]\d*)(?:\.\d*[1-9])?|-0\.\d*[1-9])$/;
const MAX_SIGNIFICANT_DIGITS = 36;
const MAX_SCALE = 30;
const EDGE_AND_EXPECTED_VALUE_LIMIT = new DecimalRuntime("999999.999999999999");
const ZERO = new DecimalRuntime("0");
const ONE = new DecimalRuntime("1");
const ISO_4217_CURRENCIES = new Set(Intl.supportedValuesOf("currency"));

declare const decimalStringBrand: unique symbol;

export type DecimalString = string & {
  readonly [decimalStringBrand]: "DecimalString";
};

export type DecimalOdds = Readonly<{
  readonly kind: "DecimalOdds";
  readonly value: DecimalString;
}>;

export type Probability = Readonly<{
  readonly kind: "Probability";
  readonly value: DecimalString;
}>;

export type FairProbability = Probability & {
  readonly __fair: true;
};

export type ImpliedProbability = Probability & {
  readonly __implied: true;
};

export type Edge = Readonly<{
  readonly kind: "Edge";
  readonly value: DecimalString;
}>;

export type ExpectedValue = Readonly<{
  readonly kind: "ExpectedValue";
  readonly value: DecimalString;
}>;

export type MarketLine = Readonly<{
  readonly kind: "MarketLine";
  readonly value: DecimalString;
}>;

export type Money = Readonly<{
  readonly kind: "Money";
  readonly amount: DecimalString;
  readonly currency: string;
}>;

export type DecimalErrorCode =
  "INVALID_DECIMAL" | "OUT_OF_RANGE" | "INVALID_CURRENCY";

export type DecimalFailure = Readonly<{
  readonly ok: false;
  readonly error: Readonly<{
    readonly code: DecimalErrorCode;
    readonly message: string;
  }>;
}>;

export type DecimalSuccess<T> = Readonly<{
  readonly ok: true;
  readonly value: T;
}>;

export type DecimalResult<T> = DecimalSuccess<T> | DecimalFailure;

function failure(code: DecimalErrorCode, message: string): DecimalFailure {
  return Object.freeze({
    ok: false,
    error: Object.freeze({ code, message }),
  });
}

function success<T>(value: T): DecimalSuccess<T> {
  return Object.freeze({ ok: true, value });
}

function decimalFromCanonical(input: unknown): DecimalResult<Decimal> {
  if (typeof input !== "string") {
    return failure("INVALID_DECIMAL", "Decimal values must be strings.");
  }

  if (!CANONICAL_DECIMAL.test(input)) {
    return failure(
      "INVALID_DECIMAL",
      "Decimal values must be canonical plain base-10 strings.",
    );
  }

  const unsigned = input.startsWith("-") ? input.slice(1) : input;
  const [integerPart = "0", fractionalPart = ""] = unsigned.split(".");
  const significantDigits =
    (integerPart === "0" ? 0 : integerPart.length) + fractionalPart.length;

  if (
    significantDigits > MAX_SIGNIFICANT_DIGITS ||
    fractionalPart.length > MAX_SCALE
  ) {
    return failure(
      "OUT_OF_RANGE",
      "Decimal exceeds the generic 36 significant-digit and 30-scale bound.",
    );
  }

  try {
    const decimal = new DecimalRuntime(input);

    if (!decimal.isFinite()) {
      return failure("INVALID_DECIMAL", "Decimal values must be finite.");
    }

    return success(decimal);
  } catch {
    return failure("INVALID_DECIMAL", "Decimal values must be finite.");
  }
}

function fitsNumeric(input: string, precision: number, scale: number): boolean {
  const unsigned = input.startsWith("-") ? input.slice(1) : input;
  const [integerPart = "0", fractionalPart = ""] = unsigned.split(".");

  return (
    integerPart.length <= precision - scale && fractionalPart.length <= scale
  );
}

function valueObject<T>(kind: string, value: DecimalString): T {
  return Object.freeze({ kind, value }) as T;
}

function probabilityValue(input: string): DecimalResult<DecimalString> {
  const decimal = decimalFromCanonical(input);

  if (!decimal.ok) {
    return decimal;
  }

  if (!fitsNumeric(input, 18, 12)) {
    return failure("OUT_OF_RANGE", "Probability exceeds numeric(18,12).");
  }

  if (decimal.value.lessThan(ZERO) || decimal.value.greaterThan(ONE)) {
    return failure("OUT_OF_RANGE", "Probability must be between 0 and 1.");
  }

  return success(input as DecimalString);
}

export function parseDecimalString(
  input: string,
): DecimalResult<DecimalString> {
  const decimal = decimalFromCanonical(input);

  return decimal.ok ? success(input as DecimalString) : decimal;
}

export function addDecimalStrings(
  left: DecimalString,
  right: DecimalString,
): DecimalResult<DecimalString> {
  const parsedLeft = decimalFromCanonical(left);
  const parsedRight = decimalFromCanonical(right);

  if (!parsedLeft.ok) return parsedLeft;
  if (!parsedRight.ok) return parsedRight;

  return parseDecimalString(parsedLeft.value.plus(parsedRight.value).toFixed());
}

function decimalOperation(
  left: DecimalString,
  right: DecimalString,
  operation: (a: Decimal, b: Decimal) => Decimal,
): DecimalResult<DecimalString> {
  const parsedLeft = decimalFromCanonical(left);
  const parsedRight = decimalFromCanonical(right);
  if (!parsedLeft.ok) return parsedLeft;
  if (!parsedRight.ok) return parsedRight;
  const result = operation(parsedLeft.value, parsedRight.value);
  if (!result.isFinite())
    return failure("INVALID_DECIMAL", "Decimal operation must be finite.");
  const canonical = result.toFixed(30).replace(/0+$/, "").replace(/\.$/, "");
  return parseDecimalString(canonical);
}

export function subtractDecimalStrings(
  left: DecimalString,
  right: DecimalString,
) {
  return decimalOperation(left, right, (a, b) => a.minus(b));
}
export function multiplyDecimalStrings(
  left: DecimalString,
  right: DecimalString,
) {
  return decimalOperation(left, right, (a, b) => a.times(b));
}
export function divideDecimalStrings(
  left: DecimalString,
  right: DecimalString,
) {
  return decimalOperation(left, right, (a, b) => a.div(b));
}

export function decimalOdds(input: string): DecimalResult<DecimalOdds> {
  const decimal = decimalFromCanonical(input);

  if (!decimal.ok) {
    return decimal;
  }

  if (!fitsNumeric(input, 18, 8)) {
    return failure("OUT_OF_RANGE", "Decimal odds exceed numeric(18,8).");
  }

  if (decimal.value.lessThanOrEqualTo(ONE)) {
    return failure("OUT_OF_RANGE", "Decimal odds must be greater than 1.");
  }

  return success(
    valueObject<DecimalOdds>("DecimalOdds", input as DecimalString),
  );
}

export function probability(input: string): DecimalResult<Probability> {
  const value = probabilityValue(input);

  return value.ok
    ? success(valueObject<Probability>("Probability", value.value))
    : value;
}

export function fairProbability(input: string): DecimalResult<FairProbability> {
  const value = probabilityValue(input);

  return value.ok
    ? success(
        Object.freeze({
          kind: "Probability" as const,
          value: value.value,
          __fair: true as const,
        }),
      )
    : value;
}

export function impliedProbability(
  input: string,
): DecimalResult<ImpliedProbability> {
  const value = probabilityValue(input);

  return value.ok
    ? success(
        Object.freeze({
          kind: "Probability" as const,
          value: value.value,
          __implied: true as const,
        }),
      )
    : value;
}

export function edge(input: string): DecimalResult<Edge> {
  const decimal = decimalFromCanonical(input);

  if (!decimal.ok) {
    return decimal;
  }

  if (!fitsNumeric(input, 18, 12)) {
    return failure("OUT_OF_RANGE", "Edge exceeds numeric(18,12).");
  }

  if (
    decimal.value.absoluteValue().greaterThan(EDGE_AND_EXPECTED_VALUE_LIMIT)
  ) {
    return failure(
      "OUT_OF_RANGE",
      "Edge exceeds the Phase 1 numeric(18,12) storage bound.",
    );
  }

  return success(valueObject<Edge>("Edge", input as DecimalString));
}

export function expectedValue(input: string): DecimalResult<ExpectedValue> {
  const decimal = decimalFromCanonical(input);

  if (!decimal.ok) {
    return decimal;
  }

  if (!fitsNumeric(input, 18, 12)) {
    return failure("OUT_OF_RANGE", "Expected value exceeds numeric(18,12).");
  }

  if (
    decimal.value.absoluteValue().greaterThan(EDGE_AND_EXPECTED_VALUE_LIMIT)
  ) {
    return failure(
      "OUT_OF_RANGE",
      "Expected value exceeds the Phase 1 numeric(18,12) storage bound.",
    );
  }

  return success(
    valueObject<ExpectedValue>("ExpectedValue", input as DecimalString),
  );
}

export function marketLine(input: string): DecimalResult<MarketLine> {
  const decimal = decimalFromCanonical(input);

  if (!decimal.ok) {
    return decimal;
  }

  if (!fitsNumeric(input, 12, 4)) {
    return failure("OUT_OF_RANGE", "Market line exceeds numeric(12,4).");
  }

  return decimal.ok
    ? success(valueObject<MarketLine>("MarketLine", input as DecimalString))
    : decimal;
}

export function money(amount: string, currency: string): DecimalResult<Money> {
  const decimal = decimalFromCanonical(amount);

  if (!decimal.ok) {
    return decimal;
  }

  if (typeof currency !== "string" || !ISO_4217_CURRENCIES.has(currency)) {
    return failure("INVALID_CURRENCY", "Currency must be an ISO 4217 code.");
  }

  return success(
    Object.freeze({
      kind: "Money",
      amount: amount as DecimalString,
      currency,
    }),
  );
}

/** Converts a PostgreSQL NUMERIC driver string into a validated decimal. */
export function numericToDecimalString(
  input: string,
): DecimalResult<DecimalString> {
  return parseDecimalString(input);
}

/** Converts a validated decimal into the canonical PostgreSQL NUMERIC string. */
export function decimalStringToNumeric(
  input: DecimalString,
): DecimalResult<string> {
  const decimal = parseDecimalString(input);

  return decimal.ok ? success(decimal.value) : decimal;
}

/** Converts a JSON decimal string into a validated decimal. */
export function jsonToDecimalString(
  input: string,
): DecimalResult<DecimalString> {
  return parseDecimalString(input);
}

/** Converts a validated decimal into the canonical JSON decimal string. */
export function decimalStringToJson(
  input: DecimalString,
): DecimalResult<string> {
  const decimal = parseDecimalString(input);

  return decimal.ok ? success(decimal.value) : decimal;
}

/**
 * Strips the insignificant trailing zeros a fixed-scale PostgreSQL column adds.
 *
 * `numericToDecimalString` is strict on purpose and rejects anything
 * non-canonical, including `1.0` — that strictness is what keeps a
 * hand-written or externally-supplied value from smuggling in a different
 * representation of the same number. But a `numeric(18, 8)` column always
 * returns its value scale-padded, so `2.1` comes back from the driver as
 * `2.10000000` and every such read fails that check. The two facts together
 * mean a real column read needs a canonicalisation step, not a looser codec.
 *
 * This is that step: purely representational, never lossy. Trailing zeros
 * after the decimal point carry no value, so removing them cannot change the
 * number, and anything that is not a plain base-10 numeral is left untouched
 * for the strict parser to reject.
 *
 *   "2.10000000" -> "2.1"      "1.000" -> "1"      "0.500" -> "0.5"
 *   "-0.250"     -> "-0.25"    "10"    -> "10"     "1e2"   -> "1e2"
 */
export function canonicalizeNumeric(input: string): string {
  if (!/^-?\d+\.\d+$/.test(input)) return input;
  const trimmed = input.replace(/0+$/, "").replace(/\.$/, "");
  return trimmed === "" || trimmed === "-" ? input : trimmed;
}

/**
 * Reads a fixed-scale PostgreSQL NUMERIC into a validated decimal.
 *
 * The pairing to use on a column read: canonicalise the driver's scale-padded
 * representation, then validate it exactly as strictly as any other decimal.
 */
export function numericColumnToDecimalString(
  input: string,
): DecimalResult<DecimalString> {
  return parseDecimalString(canonicalizeNumeric(input));
}

/**
 * Rounds a decimal to the scale its storage column actually has.
 *
 * Division and multiplication produce far more fractional digits than any of
 * VELYQ's numeric columns hold: `1 / 3.9` is 0.256410256410256410256410256410
 * at the generic 30-scale bound, and `market_implied_probability` is
 * numeric(18, 12). The validators enforce the column's scale, so a derived
 * quantity has to be rounded to that scale before it can be validated — and
 * every real bookmaker price produces exactly this situation, which is why an
 * unrounded pipeline can compute a value for 2.00 and fail on 3.90.
 *
 * Rounding to the storage scale is not a loss: the value could not be
 * persisted at higher precision anyway, and PostgreSQL would round it on
 * insert regardless. Doing it here means the rounded value is the one that
 * gets validated, compared and stored, rather than three slightly different
 * numbers. Half-even, matching the runtime's own default, so repeated
 * rounding does not drift upward.
 */
export function roundToScale(
  input: string,
  scale: number,
): DecimalResult<DecimalString> {
  const decimal = decimalFromCanonical(input);
  if (!decimal.ok) return decimal;
  if (!Number.isSafeInteger(scale) || scale < 0 || scale > MAX_SCALE)
    return failure("OUT_OF_RANGE", "Scale must be between 0 and 30.");
  const rounded = decimal.value.toDecimalPlaces(
    scale,
    DecimalRuntime.ROUND_HALF_EVEN,
  );
  /*
   * `toFixed` then canonicalise, rather than `toString`: decimal.js may
   * render an exact integer without a fractional part in one form and with
   * one in another, and the canonical form is the only one the validators
   * accept.
   */
  return parseDecimalString(canonicalizeNumeric(rounded.toFixed(scale)));
}

/** The scale of each derived quantity's storage column. */
export const STORAGE_SCALES = Object.freeze({
  probability: 12,
  impliedProbability: 12,
  odds: 8,
  edge: 12,
  expectedValue: 12,
});
