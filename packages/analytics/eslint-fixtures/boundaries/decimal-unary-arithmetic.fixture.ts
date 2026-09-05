import type { DecimalString } from "@velyq/decimal";

declare const value: DecimalString;

export const invalidPositive = +value;
export const invalidNegative = -value;
