import { decimalOdds } from "@velyq/decimal";

const result = decimalOdds("1.5");

export const invalidCalculation = result.ok
  ? result.value.value + result.value.value
  : "";
