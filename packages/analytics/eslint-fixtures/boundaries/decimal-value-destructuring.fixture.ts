import type { DecimalOdds } from "@velyq/decimal";

declare const odds: DecimalOdds;
const { value } = odds;

export const invalidCalculation = value + value;
