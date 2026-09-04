import { decimalOdds } from "@velyq/decimal";

const result = decimalOdds("1.5");

export function allowed(result: {
  readonly value: { readonly value: string };
}) {
  return result.value.value + result.value.value;
}

void result;
