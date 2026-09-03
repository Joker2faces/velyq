import { money } from "@velyq/decimal";

const result = money("1", "EUR");
export const invalid = result.ok
  ? result.value.amount + result.value.amount
  : "";
