import {
  decimalOdds,
  divideDecimalStrings,
  expectedValue,
  multiplyDecimalStrings,
  probability,
  subtractDecimalStrings,
  type DecimalOdds,
  type DecimalString,
} from "@velyq/decimal";

export const MODEL_MATURITY = "EXPERIMENTAL" as const;

export type PriceStatus =
  "ATTRACTIVE" | "FAIR" | "UNATTRACTIVE" | "INVALID_PRICE";

export type PriceValidity = Readonly<{
  readonly status: PriceStatus;
  readonly modelMaturity: typeof MODEL_MATURITY;
  readonly modelProbability: DecimalString | null;
  readonly currentOdds: DecimalOdds["value"] | null;
  readonly fairOdds: DecimalString | null;
  readonly minimumOdds: DecimalString | null;
  readonly marketImpliedProbability: DecimalString | null;
  readonly probabilityEdge: DecimalString | null;
  readonly expectedValue: DecimalString | null;
  readonly reasonCodes: readonly string[];
}>;

export type PriceScenario = PriceValidity &
  Readonly<{
    readonly candidateOdds: DecimalOdds["value"] | null;
    readonly movement: DecimalString | null;
  }>;

export type PriceValidityInput = Readonly<{
  readonly modelProbability: string | null | undefined;
  readonly currentOdds: string | null | undefined;
}>;

export type PriceSensitivityInput = Readonly<{
  readonly modelProbability: string | null | undefined;
  readonly candidateOdds: readonly string[];
}>;

function isPositive(value: DecimalString): boolean {
  return value !== ("0" as DecimalString) && !value.startsWith("-");
}

function invalidPrice(
  modelProbability: DecimalString | null,
  currentOdds: DecimalOdds["value"] | null,
  reasonCodes: readonly string[],
): PriceValidity {
  return Object.freeze({
    status: "INVALID_PRICE",
    modelMaturity: MODEL_MATURITY,
    modelProbability,
    currentOdds,
    fairOdds: null,
    minimumOdds: null,
    marketImpliedProbability: null,
    probabilityEdge: null,
    expectedValue: null,
    reasonCodes: Object.freeze([...reasonCodes]),
  });
}

export function evaluatePriceValidity(
  input: PriceValidityInput,
): PriceValidity {
  const model =
    typeof input.modelProbability === "string"
      ? probability(input.modelProbability)
      : null;
  const odds =
    typeof input.currentOdds === "string"
      ? decimalOdds(input.currentOdds)
      : null;

  if (!model?.ok || !odds?.ok) {
    return invalidPrice(
      model?.ok ? model.value.value : null,
      odds?.ok ? odds.value.value : null,
      [
        ...(!model
          ? ["MISSING_MODEL_PROBABILITY"]
          : model.ok
            ? []
            : ["INVALID_MODEL_PROBABILITY"]),
        ...(!odds
          ? ["MISSING_CURRENT_ODDS"]
          : odds.ok
            ? []
            : ["INVALID_CURRENT_ODDS"]),
      ],
    );
  }

  if (
    model.value.value === ("0" as DecimalString) ||
    model.value.value === ("1" as DecimalString)
  ) {
    return invalidPrice(model.value.value, odds.value.value, [
      "NON_ACTIONABLE_MODEL_PROBABILITY",
    ]);
  }

  const one = "1" as DecimalString;
  const fairOdds = divideDecimalStrings(one, model.value.value);
  const impliedRaw = divideDecimalStrings(one, odds.value.value);
  if (!fairOdds.ok || !impliedRaw.ok) {
    return invalidPrice(model.value.value, odds.value.value, [
      "PRICE_CALCULATION_FAILED",
    ]);
  }

  const probabilityEdge = subtractDecimalStrings(
    model.value.value,
    impliedRaw.value,
  );
  const returnMultiplier = multiplyDecimalStrings(
    model.value.value,
    odds.value.value,
  );
  if (!probabilityEdge.ok || !returnMultiplier.ok) {
    return invalidPrice(model.value.value, odds.value.value, [
      "PRICE_CALCULATION_FAILED",
    ]);
  }

  const valueRaw = subtractDecimalStrings(returnMultiplier.value, one);
  const value = valueRaw.ok ? expectedValue(valueRaw.value) : valueRaw;
  if (!valueRaw.ok || !value.ok) {
    return invalidPrice(model.value.value, odds.value.value, [
      "PRICE_CALCULATION_FAILED",
    ]);
  }

  const status: PriceStatus = isPositive(value.value.value)
    ? "ATTRACTIVE"
    : value.value.value === ("0" as DecimalString)
      ? "FAIR"
      : "UNATTRACTIVE";

  return Object.freeze({
    status,
    modelMaturity: MODEL_MATURITY,
    modelProbability: model.value.value,
    currentOdds: odds.value.value,
    fairOdds: fairOdds.value,
    minimumOdds: fairOdds.value,
    marketImpliedProbability: impliedRaw.value,
    probabilityEdge: probabilityEdge.value,
    expectedValue: value.value.value,
    reasonCodes: Object.freeze(
      status === "ATTRACTIVE"
        ? ["POSITIVE_EXPECTED_VALUE"]
        : status === "FAIR"
          ? ["ZERO_EXPECTED_VALUE"]
          : ["NEGATIVE_EXPECTED_VALUE"],
    ),
  });
}

export function createPriceSensitivity(
  input: PriceSensitivityInput,
): readonly PriceScenario[] {
  let previousOdds: DecimalOdds["value"] | null = null;

  return Object.freeze(
    input.candidateOdds.map((candidateOdds) => {
      const price = evaluatePriceValidity({
        modelProbability: input.modelProbability,
        currentOdds: candidateOdds,
      });
      const movement =
        previousOdds && price.currentOdds
          ? calculateMovement(previousOdds, price.currentOdds)
          : previousOdds
            ? null
            : ("0" as DecimalString);
      previousOdds = price.currentOdds;

      return Object.freeze({
        ...price,
        candidateOdds: price.currentOdds,
        movement,
      });
    }),
  );
}

function calculateMovement(
  openingOdds: DecimalOdds["value"],
  currentOdds: DecimalOdds["value"],
): DecimalString | null {
  const change = subtractDecimalStrings(currentOdds, openingOdds);
  if (!change.ok) return null;
  const movement = divideDecimalStrings(change.value, openingOdds);
  return movement.ok ? movement.value : null;
}
