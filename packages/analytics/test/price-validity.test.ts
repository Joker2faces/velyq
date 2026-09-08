import { describe, expect, it } from "vitest";

import {
  evaluatePriceValidity,
  priceLadder,
  PRICE_POLICY,
  PRICE_POLICY_VERSION,
  type PriceValidityPolicy,
} from "../src/price-validity.js";
import type { DecimalString } from "@velyq/decimal";

describe("break-even is not an acceptable price", () => {
  /*
   * The distinction this module exists to make. Break-even is where taking
   * the bet stops being profitable in expectation; the policy minimum sits
   * above it by the margin VELYQ demands. Reporting one number under two
   * names — as an earlier implementation did, as both `fairOdds` and
   * `minimumOdds` — invites a customer to take a price with no expected
   * value at all.
   */
  it("reports two different numbers for two different questions", () => {
    const validity = evaluatePriceValidity({
      modelProbability: "0.6",
      currentOdds: "1.85",
    });

    /* 1 / 0.6 */
    expect(validity.breakEvenOdds).toBe("1.66666667");
    /* 1.02 / 0.6 — two per cent above break-even */
    expect(validity.minimumAcceptableOdds).toBe("1.7");
    expect(validity.minimumAcceptableOdds).not.toBe(validity.breakEvenOdds);
  });

  it("puts the acceptable minimum above break-even for any probability", () => {
    for (const p of ["0.1", "0.25", "0.5", "0.6", "0.75", "0.9"]) {
      const validity = evaluatePriceValidity({
        modelProbability: p,
        currentOdds: "2",
      });
      expect(validity.breakEvenOdds).not.toBeNull();
      expect(validity.minimumAcceptableOdds).not.toBeNull();
      expect(
        Number(validity.minimumAcceptableOdds),
        `p=${p} minimum must exceed break-even`,
      ).toBeGreaterThan(Number(validity.breakEvenOdds));
    }
  });

  it("puts expected value at exactly zero on the break-even price", () => {
    const validity = evaluatePriceValidity({
      modelProbability: "0.5",
      currentOdds: "2",
    });

    expect(validity.expectedValue).toBe("0");
    expect(validity.status).toBe("AT_FAIR");
    expect(validity.breakEvenOdds).toBe("2");
  });
});

describe("a hairline positive is not an opportunity", () => {
  /*
   * VELYQ's model is EXPERIMENTAL and has so far only matched the market, so
   * a +0.3% expected value is noise wearing the shape of an edge. MARGINAL is
   * the honest answer — it is a real state, not a softened yes.
   */
  it("calls a barely positive price MARGINAL, not ATTRACTIVE", () => {
    const validity = evaluatePriceValidity({
      modelProbability: "0.34",
      currentOdds: "2.95",
    });

    /* +0.3% */
    expect(validity.expectedValue).toBe("0.003");
    expect(validity.status).toBe("MARGINAL");
    expect(validity.reasonCodes).toContain(
      "POSITIVE_BUT_BELOW_POLICY_THRESHOLD",
    );
  });

  it("calls a price clearing the threshold ATTRACTIVE", () => {
    const validity = evaluatePriceValidity({
      modelProbability: "0.6",
      currentOdds: "1.85",
    });

    expect(validity.expectedValue).toBe("0.11");
    expect(validity.status).toBe("ATTRACTIVE");
    expect(validity.reasonCodes).toContain("CLEARS_POLICY_THRESHOLD");
  });

  it("calls a short price BELOW_FAIR and says why", () => {
    const validity = evaluatePriceValidity({
      modelProbability: "0.5",
      currentOdds: "1.8",
    });

    expect(validity.status).toBe("BELOW_FAIR");
    expect(validity.reasonCodes).toContain("PRICE_TOO_SHORT");
  });

  it("treats exactly the threshold as attractive", () => {
    /*
     * Boundary pinned deliberately: a policy that says "must clear 2%" and
     * then rejects exactly 2% is a policy nobody can reason about.
     */
    const validity = evaluatePriceValidity({
      modelProbability: "0.6",
      currentOdds: "1.7",
    });

    expect(validity.expectedValue).toBe("0.02");
    expect(validity.status).toBe("ATTRACTIVE");
  });
});

describe("the policy is a decision, not a discovery", () => {
  it("is versioned on every result", () => {
    const validity = evaluatePriceValidity({
      modelProbability: "0.6",
      currentOdds: "1.85",
    });

    expect(validity.policyVersion).toBe(PRICE_POLICY_VERSION);
    expect(PRICE_POLICY.minimumAttractiveExpectedValue).toBe("0.02");
  });

  it("honours a stricter threshold supplied by the caller", () => {
    const strict: PriceValidityPolicy = {
      version: PRICE_POLICY_VERSION,
      minimumAttractiveExpectedValue: "0.15" as DecimalString,
    };

    /* +11% clears the default 2% but not a 15% bar. */
    expect(
      evaluatePriceValidity(
        { modelProbability: "0.6", currentOdds: "1.85" },
        strict,
      ).status,
    ).toBe("MARGINAL");
    expect(
      evaluatePriceValidity({ modelProbability: "0.6", currentOdds: "1.85" })
        .status,
    ).toBe("ATTRACTIVE");
  });

  it("moves the acceptable minimum with the threshold", () => {
    const strict: PriceValidityPolicy = {
      version: PRICE_POLICY_VERSION,
      minimumAttractiveExpectedValue: "0.15" as DecimalString,
    };
    const validity = evaluatePriceValidity(
      { modelProbability: "0.6", currentOdds: "1.85" },
      strict,
    );

    /* 1.15 / 0.6 */
    expect(validity.minimumAcceptableOdds).toBe("1.91666667");
  });
});

describe("missing and malformed input is reported, never guessed", () => {
  it.each([
    [
      { modelProbability: null, currentOdds: "1.85" },
      "MISSING_MODEL_PROBABILITY",
    ],
    [{ modelProbability: "0.6", currentOdds: null }, "MISSING_PRICE"],
    /*
     * Well-formed decimals that are not valid domain values. Each gets its
     * own code so an operator knows which input to look at rather than being
     * told the calculation failed.
     */
    [{ modelProbability: "0.6", currentOdds: "0.95" }, "INVALID_PRICE"],
    [
      { modelProbability: "1.4", currentOdds: "2" },
      "INVALID_MODEL_PROBABILITY",
    ],
    [
      { modelProbability: "abc", currentOdds: "2" },
      "MALFORMED_MODEL_PROBABILITY",
    ],
  ])("reports %o as UNAVAILABLE", (input, reason) => {
    const validity = evaluatePriceValidity(input);

    expect(validity.status).toBe("UNAVAILABLE");
    expect(validity.reasonCodes).toContain(reason);
    /* Nothing partially computed leaks out alongside an unavailable verdict. */
    expect(validity.expectedValue).toBeNull();
    expect(validity.breakEvenOdds).toBeNull();
  });

  it("accepts a scale-padded price from storage", () => {
    const validity = evaluatePriceValidity({
      modelProbability: "0.600000000000",
      currentOdds: "1.85000000",
    });

    expect(validity.status).toBe("ATTRACTIVE");
    expect(validity.currentOdds).toBe("1.85");
  });
});

describe("the scenario ladder", () => {
  it("prices each rung independently and in the given order", () => {
    const rungs = priceLadder({
      modelProbability: "0.6",
      candidateOdds: ["1.90", "1.80", "1.70", "1.60"],
    });

    expect(rungs.map((rung) => rung.odds)).toEqual([
      "1.9",
      "1.8",
      "1.7",
      "1.6",
    ]);
    expect(rungs.map((rung) => rung.expectedValue)).toEqual([
      "0.14",
      "0.08",
      "0.02",
      "-0.04",
    ]);
    expect(rungs.map((rung) => rung.status)).toEqual([
      "ATTRACTIVE",
      "ATTRACTIVE",
      "ATTRACTIVE",
      "BELOW_FAIR",
    ]);
  });

  it("does not depend on the order the rungs are supplied in", () => {
    /*
     * An earlier implementation reported a `movement` between consecutive
     * rungs, which is not market movement but an artifact of the caller's
     * array order — and it shared a name with the real RADAR concept.
     */
    const ascending = priceLadder({
      modelProbability: "0.6",
      candidateOdds: ["1.70", "1.80", "1.90"],
    });
    const descending = priceLadder({
      modelProbability: "0.6",
      candidateOdds: ["1.90", "1.80", "1.70"],
    });

    expect([...ascending].reverse()).toEqual(descending);
  });

  it("reports an unusable rung without discarding it", () => {
    const rungs = priceLadder({
      modelProbability: "0.6",
      candidateOdds: ["1.85", "not-a-price"],
    });

    expect(rungs).toHaveLength(2);
    expect(rungs[1]?.status).toBe("UNAVAILABLE");
    expect(rungs[1]?.odds).toBeNull();
  });
});
