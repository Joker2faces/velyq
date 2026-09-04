import type { DecimalString } from "@velyq/decimal";

declare const value: DecimalString;

export let sum = "";
sum += value;

export let difference = 0;
// @ts-expect-error The custom lint rule must also report branded subtraction.
difference -= value;

export let product = 1;
// @ts-expect-error The custom lint rule must also report branded multiplication.
product *= value;

export let quotient = 1;
// @ts-expect-error The custom lint rule must also report branded division.
quotient /= value;

export let remainder = 1;
// @ts-expect-error The custom lint rule must also report branded remainder arithmetic.
remainder %= value;

export let power = 1;
// @ts-expect-error The custom lint rule must also report branded exponentiation.
power **= value;
