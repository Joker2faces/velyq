import type { DecimalOdds } from "@velyq/decimal";

export function typed({ value }: DecimalOdds) {
  return value;
}
const odds = { value: "ordinary" };
const { value } = odds;
export const allowed = value + value;
