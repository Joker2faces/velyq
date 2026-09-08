import {
  addDecimalStrings,
  divideDecimalStrings,
  numericColumnToDecimalString,
  roundToScale,
  subtractDecimalStrings,
  STORAGE_SCALES,
  decimalOdds,
  probability,
  type DecimalString,
} from "@velyq/decimal";

import { calculateValue } from "./index.js";

/**
 * Answers the question a customer actually has in front of a price: is this
 * still worth taking, and down to what number?
 *
 * Deliberately separate from `calculateValue`, which computes the arithmetic.
 * This module applies *policy* to that arithmetic, and the two must not be
 * confused: the numbers are facts, the thresholds are a decision somebody
 * made and can be argued with. The policy is therefore versioned and passed
 * in, never inlined at a call site.
 */

export const PRICE_POLICY_VERSION = "price-validity.v1" as const;

export type PriceValidityPolicy = Readonly<{
  version: typeof PRICE_POLICY_VERSION;
  /**
   * The expected value a price must clear to be called attractive.
   *
   * Not zero. A selection at +0.2% expected value is arithmetically positive
   * and practically indistinguishable from fair, and VELYQ's own model is
   * EXPERIMENTAL and has so far only matched the market — so treating a
   * hairline positive as attractive would dress up noise as an opportunity.
   * Anything positive but below this is MARGINAL, which is a real and useful
   * answer rather than a softened yes.
   */
  minimumAttractiveExpectedValue: DecimalString;
}>;

export const PRICE_POLICY: PriceValidityPolicy = Object.freeze({
  version: PRICE_POLICY_VERSION,
  minimumAttractiveExpectedValue: "0.02" as DecimalString,
});

export type PriceValidityStatus =
  "ATTRACTIVE" | "MARGINAL" | "AT_FAIR" | "BELOW_FAIR" | "UNAVAILABLE";

export type PriceValidity = Readonly<{
  status: PriceValidityStatus;
  policyVersion: typeof PRICE_POLICY_VERSION;
  modelProbability: DecimalString | null;
  currentOdds: DecimalString | null;
  impliedProbability: DecimalString | null;
  probabilityEdge: DecimalString | null;
  expectedValue: DecimalString | null;
  /**
   * The price at which expected value is exactly zero — `1 / p`.
   *
   * This is the break-even point and nothing else. The name matters: an
   * earlier implementation reported the same number twice, once as `fairOdds`
   * and once as `minimumOdds`, which invited the reading that break-even was
   * an acceptable price to take. It is the point at which taking the bet
   * stops being profitable in expectation.
   */
  breakEvenOdds: DecimalString | null;
  /**
   * The lowest price that still clears the policy threshold.
   *
   * Strictly worse for the customer than `breakEvenOdds` is for the
   * bookmaker: derived as `(1 + threshold) / p`, so it sits above break-even
   * by exactly the margin the policy demands. This is the number a customer
   * should watch, and the one a "tell me if it reaches X" feature should
   * default to.
   */
  minimumAcceptableOdds: DecimalString | null;
  reasonCodes: readonly string[];
}>;

function unavailable(reasonCodes: readonly string[]): PriceValidity {
  return Object.freeze({
    status: "UNAVAILABLE",
    policyVersion: PRICE_POLICY_VERSION,
    modelProbability: null,
    currentOdds: null,
    impliedProbability: null,
    probabilityEdge: null,
    expectedValue: null,
    breakEvenOdds: null,
    minimumAcceptableOdds: null,
    reasonCodes: Object.freeze([...reasonCodes]),
  });
}

/**
 * The price at which expected value equals `target`.
 *
 * From `EV = p * odds - 1`, solving for odds gives `(1 + EV) / p`. Used for
 * both the break-even price (target zero) and the policy minimum.
 */
function oddsForExpectedValue(
  modelProbability: DecimalString,
  target: DecimalString,
): DecimalString | null {
  const numerator = addDecimalStrings("1" as DecimalString, target);
  if (!numerator.ok) return null;
  const odds = divideDecimalStrings(numerator.value, modelProbability);
  if (!odds.ok) return null;
  const rounded = roundToScale(odds.value, STORAGE_SCALES.odds);
  return rounded.ok ? rounded.value : null;
}

/**
 * Sign of `left - right`, without leaving the decimal domain.
 *
 * Comparing through `Number` would reintroduce binary floating point at the
 * one place the whole package exists to avoid it, and the repository lints
 * against arithmetic on branded decimals for exactly that reason.
 */
function compareDecimals(
  left: DecimalString,
  right: DecimalString,
): -1 | 0 | 1 | null {
  const difference = subtractDecimalStrings(left, right);
  if (!difference.ok) return null;
  if (difference.value.startsWith("-")) return -1;
  return Number.parseFloat(difference.value) === 0 ? 0 : 1;
}

export function evaluatePriceValidity(
  input: Readonly<{
    modelProbability: string | null | undefined;
    currentOdds: string | null | undefined;
  }>,
  policy: PriceValidityPolicy = PRICE_POLICY,
): PriceValidity {
  if (typeof input.modelProbability !== "string")
    return unavailable(["MISSING_MODEL_PROBABILITY"]);
  if (typeof input.currentOdds !== "string")
    return unavailable(["MISSING_PRICE"]);

  const model = numericColumnToDecimalString(input.modelProbability);
  const odds = numericColumnToDecimalString(input.currentOdds);
  if (!model.ok) return unavailable(["MALFORMED_MODEL_PROBABILITY"]);
  if (!odds.ok) return unavailable(["MALFORMED_PRICE"]);

  /*
   * Range-checked separately from parsing, so the reason a value was refused
   * survives. "1.4" is a perfectly well-formed decimal that is not a
   * probability, and "0.95" is a well-formed decimal that is not a price a
   * bookmaker could offer — collapsing both into a generic calculation
   * failure would tell an operator nothing about which input to look at.
   */
  const validModel = probability(model.value);
  if (!validModel.ok) return unavailable(["INVALID_MODEL_PROBABILITY"]);
  const validOdds = decimalOdds(odds.value);
  if (!validOdds.ok) return unavailable(["INVALID_PRICE"]);

  const value = calculateValue(model.value, odds.value);
  if (!value.ok) return unavailable(["PRICE_CALCULATION_FAILED"]);

  const breakEvenOdds = oddsForExpectedValue(model.value, "0" as DecimalString);
  const minimumAcceptableOdds = oddsForExpectedValue(
    model.value,
    policy.minimumAttractiveExpectedValue,
  );

  const expectedValue = value.value.expectedValue;
  const againstThreshold = compareDecimals(
    expectedValue,
    policy.minimumAttractiveExpectedValue,
  );
  const againstZero = compareDecimals(expectedValue, "0" as DecimalString);
  if (againstThreshold === null || againstZero === null)
    return unavailable(["PRICE_COMPARISON_FAILED"]);

  const status: PriceValidityStatus =
    againstThreshold >= 0
      ? "ATTRACTIVE"
      : againstZero > 0
        ? "MARGINAL"
        : againstZero === 0
          ? "AT_FAIR"
          : "BELOW_FAIR";

  return Object.freeze({
    status,
    policyVersion: policy.version,
    modelProbability: model.value,
    currentOdds: odds.value,
    impliedProbability: value.value.impliedProbability,
    probabilityEdge: value.value.probabilityEdge,
    expectedValue,
    breakEvenOdds,
    minimumAcceptableOdds,
    reasonCodes: Object.freeze(
      status === "ATTRACTIVE"
        ? ["CLEARS_POLICY_THRESHOLD"]
        : status === "MARGINAL"
          ? ["POSITIVE_BUT_BELOW_POLICY_THRESHOLD"]
          : status === "AT_FAIR"
            ? ["ZERO_EXPECTED_VALUE"]
            : ["NEGATIVE_EXPECTED_VALUE", "PRICE_TOO_SHORT"],
    ),
  });
}

export type PriceLadderRung = Readonly<{
  odds: DecimalString | null;
  expectedValue: DecimalString | null;
  status: PriceValidityStatus;
}>;

/**
 * Evaluates a set of hypothetical prices against one model probability.
 *
 * Answers "at 1.90, 1.80, 1.70 — what is the expected value" deterministically
 * and with no narrative. Each rung is independent: an earlier implementation
 * reported a `movement` between consecutive rungs, which is not market
 * movement at all but an artifact of the order the caller happened to pass
 * its hypotheticals in, sharing a name with the real RADAR concept.
 *
 * Order is preserved as given so a caller can present the ladder however it
 * likes; nothing here depends on the sequence.
 */
export function priceLadder(
  input: Readonly<{
    modelProbability: string | null | undefined;
    candidateOdds: readonly string[];
  }>,
  policy: PriceValidityPolicy = PRICE_POLICY,
): readonly PriceLadderRung[] {
  return Object.freeze(
    input.candidateOdds.map((candidate) => {
      const validity = evaluatePriceValidity(
        { modelProbability: input.modelProbability, currentOdds: candidate },
        policy,
      );
      return Object.freeze({
        odds: validity.currentOdds,
        expectedValue: validity.expectedValue,
        status: validity.status,
      });
    }),
  );
}
