import { describe, expect, it } from "vitest";

import { calculateValue } from "../src/index.js";
import type { DecimalString } from "@velyq/decimal";

const d = (value: string) => value as DecimalString;

/*
 * `calculateValue` used to fail on essentially every price a bookmaker
 * quotes. Two independent causes, and both had to be true at once for the
 * handful of working cases to look like evidence that it worked:
 *
 *   - inputs arrive scale-padded from numeric(18, 8), so "2.10" and
 *     "2.10000000" were rejected as non-canonical decimals;
 *   - outputs are unbounded quotients, so 1 / 3.9 ran to thirty digits and
 *     the numeric(18, 12) validator refused it as out of range.
 *
 * The result was that `edge` and `expectedValue` were null for all but tidy
 * prices like 2.00 at an even 50%, which is exactly the shape of a test
 * fixture — so the suite was green while the product could not price a real
 * market.
 */
describe("value metrics on prices bookmakers actually quote", () => {
  it("computes the documented reference case", () => {
    const result = calculateValue(d("0.6"), d("1.85"));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    /* fair 1.67, implied 54.1%, edge +5.9 pp, EV +11.0% */
    expect(result.value.fairOdds).toBe("1.66666667");
    expect(result.value.impliedProbability).toBe("0.540540540541");
    expect(result.value.probabilityEdge).toBe("0.059459459459");
    expect(result.value.expectedValue).toBe("0.11");
  });

  it.each([
    ["2.10", "a price with one trailing zero"],
    ["2.10000000", "the same price as numeric(18, 8) returns it"],
    ["3.9", "a quotient that runs past the storage scale"],
    ["3.90", "both problems at once"],
    ["2.95", "an awkward three-significant-figure price"],
    ["1.01", "the shortest realistic price"],
    ["15.5", "a longshot"],
  ])("prices %s — %s", (odds) => {
    const result = calculateValue(d("0.34"), d(odds));

    expect(result.ok, `calculateValue rejected odds ${odds}`).toBe(true);
  });

  it("still refuses genuinely invalid input", () => {
    /*
     * Canonicalisation must not have become a repair function. These have to
     * keep failing, or the fix would have traded one silent wrong answer for
     * another.
     */
    expect(calculateValue(d("0.6"), d("0.95")).ok).toBe(false);
    expect(calculateValue(d("0.6"), d("-2")).ok).toBe(false);
    expect(calculateValue(d("1.4"), d("2")).ok).toBe(false);
    expect(calculateValue(d("0.6"), d("1e5")).ok).toBe(false);
    expect(calculateValue(d("abc"), d("2")).ok).toBe(false);
  });
});

describe("invariants that must hold for any accepted price", () => {
  const cases: readonly (readonly [string, string])[] = [
    ["0.6", "1.85"],
    ["0.34", "2.95"],
    ["0.55", "3.9"],
    ["0.5", "2"],
    ["0.256", "3.90"],
    ["0.75", "1.4"],
  ];

  it("keeps fair odds equal to 1 / p at the stored scale", () => {
    for (const [p, odds] of cases) {
      const result = calculateValue(d(p), d(odds));
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      /*
       * Checked numerically rather than by recomputing with the same helper,
       * so an error in the helper cannot make the assertion agree with it.
       */
      expect(Number(result.value.fairOdds)).toBeCloseTo(1 / Number(p), 6);
    }
  });

  it("keeps EV equal to p * odds - 1", () => {
    for (const [p, odds] of cases) {
      const result = calculateValue(d(p), d(odds));
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(Number(result.value.expectedValue)).toBeCloseTo(
        Number(p) * Number(odds) - 1,
        6,
      );
    }
  });

  it("keeps the edge equal to model minus displayed implied probability", () => {
    /*
     * The relationship a reader can check by hand has to hold for the numbers
     * on screen, not for unrounded intermediates nobody sees.
     */
    for (const [p, odds] of cases) {
      const result = calculateValue(d(p), d(odds));
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(Number(result.value.probabilityEdge)).toBeCloseTo(
        Number(p) - Number(result.value.impliedProbability),
        9,
      );
    }
  });

  it("agrees on the sign of the edge and the sign of EV", () => {
    /*
     * A positive edge with a negative expected value is arithmetically
     * impossible for a single selection, so a disagreement would mean one of
     * the two was computed from a different price.
     */
    for (const [p, odds] of cases) {
      const result = calculateValue(d(p), d(odds));
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(Math.sign(Number(result.value.probabilityEdge))).toBe(
        Math.sign(Number(result.value.expectedValue)),
      );
    }
  });

  it("reports zero EV exactly at fair odds", () => {
    const fair = calculateValue(d("0.5"), d("2"));
    expect(fair.ok).toBe(true);
    if (!fair.ok) return;
    expect(fair.value.expectedValue).toBe("0");
    expect(fair.value.probabilityEdge).toBe("0");
  });
});
