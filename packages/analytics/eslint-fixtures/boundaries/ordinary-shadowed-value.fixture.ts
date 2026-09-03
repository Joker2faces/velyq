import type { DecimalOdds } from "@velyq/decimal";

declare const odds: DecimalOdds;

export function allowed(odds: { readonly value: string }) {
  return odds.value + odds.value;
}

void odds;
