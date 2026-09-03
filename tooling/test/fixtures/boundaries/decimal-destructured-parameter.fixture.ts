import type { DecimalOdds } from "@velyq/decimal";

export function invalid({ value }: DecimalOdds) {
  return value + value;
}
