import { describe, expect, it } from "vitest";
import type { DecimalString } from "@velyq/decimal";
import {
  devigMultiplicative,
  devigPower,
  devigShin,
  marketConsensus,
} from "../src/devig.js";

const odds = (values: readonly string[]) =>
  values as unknown as readonly DecimalString[];

function sum(values: readonly DecimalString[]): number {
  return values.reduce((total, value) => total + Number(value), 0);
}

/*
 * A textbook 3-way market: decimal odds 2.00 / 3.50 / 4.00.
 *   implied = 0.5, 0.285714286, 0.25 -> raw sum = 1.035714286 (3.57% overround)
 * This exact case is hand-verifiable, so the multiplicative result below is
 * an exact numerical test vector rather than a structural assertion — the
 * expected values are the actual arithmetic (implied_i / 1.035714286),
 * computed by hand to 6 decimal places.
 */
const THREE_WAY = odds(["2", "3.5", "4"]);

describe("devigMultiplicative", () => {
  it("matches the hand-computed fair probabilities for a known 3-way market", () => {
    const result = devigMultiplicative(THREE_WAY);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [home, draw, away] = result.value.probabilities.map(Number);
    // implied: 0.500000, 0.285714, 0.250000; raw sum: 1.035714
    expect(home).toBeCloseTo(0.5 / 1.0357142857, 5);
    expect(draw).toBeCloseTo(0.2857142857 / 1.0357142857, 5);
    expect(away).toBeCloseTo(0.25 / 1.0357142857, 5);
    expect(sum(result.value.probabilities)).toBeCloseTo(1, 8);
  });

  it("reports the raw overround", () => {
    const result = devigMultiplicative(THREE_WAY);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Number(result.value.overround)).toBeCloseTo(0.0357142857, 6);
  });

  it("returns each probability unchanged when the market has zero overround", () => {
    // implied: 0.5, 0.5 -> sum exactly 1, no vig to remove.
    const result = devigMultiplicative(odds(["2", "2"]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Number(result.value.probabilities[0])).toBeCloseTo(0.5, 8);
    expect(Number(result.value.overround)).toBeCloseTo(0, 8);
  });

  it("rejects a market described by fewer than two outcomes", () => {
    expect(devigMultiplicative(odds(["2"])).ok).toBe(false);
  });
});

/*
 * The power and Shin methods require iterative root-finding, so their exact
 * output for a given input is not something to hand-verify against a
 * memorised reference value without risking a subtly wrong "expected"
 * number passing a test that hides a real bug. Instead these assert the
 * mathematical properties any correct solution must have — properties that
 * are independent of the numerical method's own inner workings.
 */
describe("devigPower", () => {
  it("sums to 1 and preserves the market's outcome ordering", () => {
    const result = devigPower(THREE_WAY);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(sum(result.value.probabilities)).toBeCloseTo(1, 8);
    const [home, draw, away] = result.value.probabilities.map(Number);
    // The favourite must stay the favourite: de-vigging must not reorder
    // outcomes relative to their raw implied probabilities.
    expect(home).toBeGreaterThan(draw);
    expect(draw).toBeGreaterThan(away);
  });

  it("shrinks every outcome relative to its raw implied probability", () => {
    // Removing a genuine positive overround can only ever reduce every
    // outcome's probability (their sum drops from > 1 to exactly 1); any
    // outcome that came out *larger* than its raw implied probability would
    // mean the solver converged somewhere it should not have.
    const result = devigPower(THREE_WAY);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const implied = [1 / 2, 1 / 3.5, 1 / 4];
    result.value.probabilities.forEach((value, index) => {
      expect(Number(value)).toBeLessThanOrEqual(implied[index]!);
    });
  });

  it("rejects odds with zero or negative overround", () => {
    expect(devigPower(odds(["2", "2"])).ok).toBe(false);
  });
});

describe("devigShin", () => {
  it("sums to 1 and preserves the market's outcome ordering", () => {
    const result = devigShin(THREE_WAY);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(sum(result.value.probabilities)).toBeCloseTo(1, 6);
    const [home, draw, away] = result.value.probabilities.map(Number);
    expect(home).toBeGreaterThan(draw);
    expect(draw).toBeGreaterThan(away);
  });

  it("separates favourites from longshots more than the multiplicative method does", () => {
    /*
     * This is Shin's whole point: it attributes more of the overround to
     * the longshot than the multiplicative method does, which — for a
     * favourite-longshot-biased book — should pull the favourite's fair
     * probability *up* relative to the multiplicative answer and the
     * longshot's *down*. This is the one property that actually
     * distinguishes Shin from a method that merely also happens to sum to
     * 1, so it is worth asserting even though it is still a relative rather
     * than an absolute numerical vector.
     */
    const multiplicative = devigMultiplicative(THREE_WAY);
    const shin = devigShin(THREE_WAY);
    expect(multiplicative.ok && shin.ok).toBe(true);
    if (!multiplicative.ok || !shin.ok) return;
    const favourite = {
      mult: Number(multiplicative.value.probabilities[0]),
      shin: Number(shin.value.probabilities[0]),
    };
    const longshot = {
      mult: Number(multiplicative.value.probabilities[2]),
      shin: Number(shin.value.probabilities[2]),
    };
    expect(favourite.shin).toBeGreaterThanOrEqual(favourite.mult);
    expect(longshot.shin).toBeLessThanOrEqual(longshot.mult);
  });

  it("rejects odds with zero or negative overround", () => {
    expect(devigShin(odds(["2", "2"])).ok).toBe(false);
  });
});

describe("marketConsensus", () => {
  it("averages de-vigged probabilities across bookmakers, not raw odds", () => {
    const consensus = marketConsensus(
      [
        {
          bookmaker: "a",
          odds: odds(["2", "3.5", "4"]),
          observedAt: "2026-09-07T10:00:00Z",
        },
        {
          bookmaker: "b",
          odds: odds(["1.95", "3.6", "4.1"]),
          observedAt: "2026-09-07T10:00:30Z",
        },
      ],
      "MULTIPLICATIVE",
    );
    expect(consensus.ok).toBe(true);
    if (!consensus.ok) return;
    expect(consensus.value.bookmakerCoverage).toBe(2);
    expect(sum(consensus.value.probabilities)).toBeCloseTo(1, 6);
    expect(consensus.value.observationSpreadSeconds).toBe(30);
  });

  it("reports zero dispersion when every bookmaker agrees exactly", () => {
    const consensus = marketConsensus([
      { bookmaker: "a", odds: THREE_WAY, observedAt: "2026-09-07T10:00:00Z" },
      { bookmaker: "b", odds: THREE_WAY, observedAt: "2026-09-07T10:00:00Z" },
    ]);
    expect(consensus.ok).toBe(true);
    if (!consensus.ok) return;
    consensus.value.dispersion.forEach((value) =>
      expect(Number(value)).toBeCloseTo(0, 8),
    );
  });

  it("widens dispersion when bookmakers disagree", () => {
    const agreeing = marketConsensus([
      { bookmaker: "a", odds: THREE_WAY, observedAt: "2026-09-07T10:00:00Z" },
      { bookmaker: "b", odds: THREE_WAY, observedAt: "2026-09-07T10:00:00Z" },
    ]);
    const disagreeing = marketConsensus([
      {
        bookmaker: "a",
        odds: odds(["1.7", "4", "5.5"]),
        observedAt: "2026-09-07T10:00:00Z",
      },
      {
        bookmaker: "b",
        odds: odds(["2.3", "3.1", "3.2"]),
        observedAt: "2026-09-07T10:00:00Z",
      },
    ]);
    expect(agreeing.ok && disagreeing.ok).toBe(true);
    if (!agreeing.ok || !disagreeing.ok) return;
    expect(Number(disagreeing.value.dispersion[0])).toBeGreaterThan(
      Number(agreeing.value.dispersion[0]),
    );
  });

  it("rejects quotes covering different numbers of outcomes", () => {
    const result = marketConsensus([
      { bookmaker: "a", odds: THREE_WAY, observedAt: "2026-09-07T10:00:00Z" },
      {
        bookmaker: "b",
        odds: odds(["1.9", "1.95"]),
        observedAt: "2026-09-07T10:00:00Z",
      },
    ]);
    expect(result.ok).toBe(false);
  });

  it("rejects an empty quote list", () => {
    expect(marketConsensus([]).ok).toBe(false);
  });
});
