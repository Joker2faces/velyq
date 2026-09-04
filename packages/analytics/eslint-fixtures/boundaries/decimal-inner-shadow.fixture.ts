import type { DecimalOdds } from "@velyq/decimal";

const odds = { value: "ordinary" };
export function invalid(odds: DecimalOdds) {
  return odds.value + odds.value;
}
void odds;
