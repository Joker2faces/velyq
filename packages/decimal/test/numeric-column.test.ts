import { describe, expect, it } from "vitest";

import {
  canonicalizeNumeric,
  divideDecimalStrings,
  multiplyDecimalStrings,
  numericColumnToDecimalString,
  parseDecimalString,
  roundToScale,
  subtractDecimalStrings,
  STORAGE_SCALES,
  type DecimalString,
} from "../src/index.js";

const d = (value: string) => value as DecimalString;

/*
 * These pin a defect that made the documented worked example uncomputable.
 *
 * `parseDecimalString` requires a canonical decimal with no trailing zeros,
 * and neither PostgreSQL nor a bookmaker produces one. A numeric(18, 8)
 * column holding 2.10 reads back as "2.10000000", and 2.10, 1.50 and 2.00 are
 * ordinary quotes — so every decimal operation rejected a large fraction of
 * real prices, and the market move 2.10 -> 1.85 could not be calculated at
 * all.
 */
describe("scale-padded prices from the database", () => {
  it("rejects a padded value without canonicalisation", () => {
    /*
     * The failing case itself, asserted so nobody relaxes the validator
     * instead. Strictness is correct; the read path was missing a step.
     */
    expect(parseDecimalString("2.10").ok).toBe(false);
    expect(parseDecimalString("2.10000000").ok).toBe(false);
    expect(parseDecimalString("2.1").ok).toBe(true);
  });

  it("accepts the same value once canonicalised", () => {
    expect(numericColumnToDecimalString("2.10").ok).toBe(true);
    expect(numericColumnToDecimalString("2.10000000")).toEqual({
      ok: true,
      value: "2.1",
    });
  });

  it("leaves a non-plain decimal alone so it still fails validation", () => {
    /*
     * Canonicalisation must not become a general-purpose repair function. A
     * malformed input has to keep failing rather than be silently reshaped
     * into something the validator will accept.
     */
    expect(canonicalizeNumeric("1e5")).toBe("1e5");
    expect(numericColumnToDecimalString("1e5").ok).toBe(false);
    expect(canonicalizeNumeric("abc")).toBe("abc");
    expect(canonicalizeNumeric("2")).toBe("2");
  });

  it("keeps a bare zero and a negative sign intact", () => {
    expect(canonicalizeNumeric("0.000")).toBe("0");
    expect(canonicalizeNumeric("-0.500")).toBe("-0.5");
    expect(canonicalizeNumeric("2.00000000")).toBe("2");
  });
});

describe("the documented worked example", () => {
  /*
   * odds 1.85, model 60.0% — the reference figures the product copy quotes.
   * If any of these drift, either the maths or the documentation is wrong.
   */
  const odds = d("1.85");
  const model = d("0.6");

  it("computes fair odds as 1 / p", () => {
    const fair = divideDecimalStrings(d("1"), model);
    expect(fair.ok).toBe(true);
    if (!fair.ok) return;
    /* Exact quotient is unbounded; the storage scale is what gets shown. */
    expect(roundToScale(fair.value, STORAGE_SCALES.odds)).toEqual({
      ok: true,
      value: "1.66666667",
    });
    expect(roundToScale(fair.value, 2)).toEqual({ ok: true, value: "1.67" });
  });

  it("computes raw implied probability as 1 / odds", () => {
    const implied = divideDecimalStrings(d("1"), odds);
    expect(implied.ok).toBe(true);
    if (!implied.ok) return;
    /* 54.1% — raw implied, which is NOT a fair probability. */
    expect(roundToScale(implied.value, 3)).toEqual({
      ok: true,
      value: "0.541",
    });
  });

  it("computes the probability edge in percentage points", () => {
    const implied = divideDecimalStrings(d("1"), odds);
    if (!implied.ok) throw new Error("unreachable");
    const edge = subtractDecimalStrings(model, implied.value);
    expect(edge.ok).toBe(true);
    if (!edge.ok) return;
    /* +5.9 pp */
    expect(roundToScale(edge.value, 3)).toEqual({ ok: true, value: "0.059" });
  });

  it("computes expected value as p * odds - 1", () => {
    const gross = multiplyDecimalStrings(model, odds);
    expect(gross.ok).toBe(true);
    if (!gross.ok) return;
    const ev = subtractDecimalStrings(gross.value, d("1"));
    /* +11.0% */
    expect(ev).toEqual({ ok: true, value: "0.11" });
  });

  it("computes the market move from a padded opening price", () => {
    /*
     * The case that was impossible: both a shortening price and an opening
     * quote carrying trailing zeros, which is how it arrives from storage.
     */
    const opening = numericColumnToDecimalString("2.10000000");
    const current = numericColumnToDecimalString("1.85");
    expect(opening.ok && current.ok).toBe(true);
    if (!opening.ok || !current.ok) return;
    const change = subtractDecimalStrings(current.value, opening.value);
    expect(change.ok).toBe(true);
    if (!change.ok) return;
    const movement = divideDecimalStrings(change.value, opening.value);
    expect(movement.ok).toBe(true);
    if (!movement.ok) return;
    /* -11.9% */
    expect(roundToScale(movement.value, 4)).toEqual({
      ok: true,
      value: "-0.119",
    });
  });
});

describe("rounding invariants", () => {
  it("refuses a scale outside the supported range", () => {
    expect(roundToScale("1.5", -1).ok).toBe(false);
    expect(roundToScale("1.5", 31).ok).toBe(false);
    expect(roundToScale("1.5", 0)).toEqual({ ok: true, value: "2" });
  });

  it("is idempotent, so repeated rounding cannot drift", () => {
    const once = roundToScale("1.666666666666666666666666666667", 8);
    expect(once.ok).toBe(true);
    if (!once.ok) return;
    const twice = roundToScale(once.value, 8);
    expect(twice).toEqual(once);
  });

  it("rounds half to even rather than always up", () => {
    /*
     * Half-up would bias every repeatedly-rounded quantity upward, which on
     * an edge or an expected value is a bias in the flattering direction.
     */
    expect(roundToScale("0.125", 2)).toEqual({ ok: true, value: "0.12" });
    expect(roundToScale("0.135", 2)).toEqual({ ok: true, value: "0.14" });
  });

  it("produces a value the strict validator accepts", () => {
    const rounded = roundToScale("2.000000004", 4);
    expect(rounded).toEqual({ ok: true, value: "2" });
    if (!rounded.ok) return;
    expect(parseDecimalString(rounded.value).ok).toBe(true);
  });
});
