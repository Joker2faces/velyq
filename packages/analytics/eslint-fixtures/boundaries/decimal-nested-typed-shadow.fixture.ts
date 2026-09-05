import type { DecimalOdds } from "@velyq/decimal";

export function outer(odds: { readonly value: string }) {
  function invalid(odds: DecimalOdds) {
    return odds.value + odds["value"];
  }

  return [odds.value, invalid] as const;
}
