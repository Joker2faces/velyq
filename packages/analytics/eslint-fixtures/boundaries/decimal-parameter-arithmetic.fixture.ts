import type { DecimalOdds } from "@velyq/decimal";

export function invalid(odds: DecimalOdds) {
  return odds["value"] + odds.value;
}
