import { describe, expect, it } from "vitest";

import {
  addDecimalStrings,
  decimalOdds,
  decimalStringToJson,
  decimalStringToNumeric,
  edge,
  expectedValue,
  fairProbability,
  impliedProbability,
  jsonToDecimalString,
  marketLine,
  money,
  numericToDecimalString,
  parseDecimalString,
  probability,
} from "../src/index.js";

function successful<T>(result: {
  readonly ok: boolean;
  readonly value?: T;
}): T {
  expect(result.ok).toBe(true);

  if (!result.ok || result.value === undefined) {
    throw new Error("Expected a successful decimal result");
  }

  return result.value;
}

describe("canonical decimal strings", () => {
  it.each([
    ["0", true],
    ["-1.25", true],
    ["123456789.987654321", true],
    ["01", false],
    ["1.20", false],
    ["-0", false],
    [".5", false],
    ["1e2", false],
    ["NaN", false],
    ["Infinity", false],
  ])("accepts canonical plain decimal %s only when valid", (input, valid) => {
    expect(parseDecimalString(input).ok).toBe(valid);
  });

  it("keeps exact addition in canonical non-exponential form", () => {
    const left = successful(parseDecimalString("0.1"));
    const right = successful(parseDecimalString("0.2"));

    expect(addDecimalStrings(left, right)).toBe("0.3");
  });
});

describe("market decimal value objects", () => {
  it.each([
    ["0", true],
    ["0.5", true],
    ["1", true],
    ["-0.1", false],
    ["1.0000000000001", false],
  ])(
    "allows probability %s only within the inclusive unit interval",
    (input, valid) => {
      expect(probability(input).ok).toBe(valid);
      expect(fairProbability(input).ok).toBe(valid);
      expect(impliedProbability(input).ok).toBe(valid);
    },
  );

  it("distinguishes fair and implied probability brands", () => {
    const fair = successful(fairProbability("0.5"));
    const implied = successful(impliedProbability("0.5"));

    expect(fair.__fair).toBe(true);
    expect(implied.__implied).toBe(true);
  });

  it.each([
    ["1.01", true],
    ["1000", true],
    ["1", false],
    ["0", false],
    ["-2", false],
  ])(
    "allows decimal odds %s only when strictly greater than one",
    (input, valid) => {
      expect(decimalOdds(input).ok).toBe(valid);
    },
  );

  it("rejects edge and expected-value values outside their storage range", () => {
    expect(edge("999999.999999999999").ok).toBe(true);
    expect(expectedValue("-999999.999999999999").ok).toBe(true);
    expect(edge("1000000").ok).toBe(false);
    expect(expectedValue("-1000000").ok).toBe(false);
  });

  it("creates immutable signed lines and validates ISO 4217 money", () => {
    const line = successful(marketLine("-2.25"));
    const validMoney = money("12.5", "EUR");

    expect(Object.isFrozen(line)).toBe(true);
    expect(validMoney.ok).toBe(true);
    expect(money("12.5", "EURO").ok).toBe(false);
    expect(money("12.5", "eur").ok).toBe(false);
  });
});

describe("decimal boundary codecs", () => {
  it("round-trips canonical PostgreSQL NUMERIC and JSON strings", () => {
    const fromNumeric = successful(numericToDecimalString("123.45"));
    const fromJson = successful(jsonToDecimalString("0.125"));

    expect(decimalStringToNumeric(fromNumeric)).toBe("123.45");
    expect(decimalStringToJson(fromJson)).toBe("0.125");
  });

  it.each(["1e2", "1.0", "NaN", "Infinity"])(
    "rejects non-canonical external decimal strings: %s",
    (input) => {
      expect(numericToDecimalString(input).ok).toBe(false);
      expect(jsonToDecimalString(input).ok).toBe(false);
    },
  );
});
