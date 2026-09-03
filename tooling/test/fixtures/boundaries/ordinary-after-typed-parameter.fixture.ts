import type { DecimalOdds } from "@velyq/decimal";

export function typed(odds: DecimalOdds) {
  return odds.value;
}
const odds = { value: "ordinary" };
const { value } = odds;
export const allowed = value + value;
