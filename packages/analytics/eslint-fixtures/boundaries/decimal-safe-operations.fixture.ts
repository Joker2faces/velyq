import type { DecimalString } from "@velyq/decimal";

declare const value: DecimalString;

let assigned: DecimalString;
assigned = value;
export const firstAssignment = assigned;
assigned = value;

export const equal = value === assigned;
export const compared = value < assigned;

function passThrough(input: DecimalString) {
  return input;
}

export const passed = passThrough(value);
export const serialized = JSON.stringify(value);

export const ordinaryPositive = +"1";
export const ordinaryNegative = -"1";

export let ordinaryString = "1";
ordinaryString += "2";

export let ordinaryNumber = 2;
ordinaryNumber -= 1;
ordinaryNumber *= 2;
ordinaryNumber /= 2;
ordinaryNumber %= 2;
ordinaryNumber **= 2;
