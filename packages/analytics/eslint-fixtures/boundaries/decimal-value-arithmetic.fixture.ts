import type { DecimalOdds } from "@velyq/decimal";

declare const odds: DecimalOdds;

export const invalidCalculation = odds["value"] + odds.value;
