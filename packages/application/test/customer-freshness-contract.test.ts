import { describe, expect, it } from "vitest";
import { ODDS_FRESHNESS_STATES } from "../src/odds-freshness.js";
import {
  customerOddsFreshnessStates,
  type CustomerOddsFreshness,
} from "@velyq/contracts";

/**
 * The customer contract's freshness vocabulary must be the policy's.
 *
 * The DTO used to say `"FRESH" | "STALE"`, collapsing four policy states into
 * two: an AGING price (46-180 minutes old) rendered identically to one
 * observed twenty-seven hours ago, and UNAVAILABLE -- no usable price at all
 * -- was indistinguishable from a merely old one.
 *
 * `@velyq/contracts` depends on nothing but `@velyq/decimal` by design, so it
 * declares the union rather than importing it. This test is what stops that
 * independence becoming divergence: the two lists must be identical, in the
 * same order, with nothing extra on either side.
 *
 * It lives in `@velyq/application` rather than `@velyq/contracts` because
 * only this direction of dependency exists -- contracts importing application,
 * even in a test, would close a cycle in the workspace graph.
 */

describe("customer freshness contract", () => {
  it("matches the odds freshness policy exactly", () => {
    expect([...customerOddsFreshnessStates]).toEqual([
      ...ODDS_FRESHNESS_STATES,
    ]);
  });

  /*
   * Named explicitly, so that removing one from the policy fails here with a
   * readable diff rather than only through the array comparison above.
   */
  it("carries all four states", () => {
    for (const state of [
      "CURRENT",
      "AGING",
      "STALE",
      "UNAVAILABLE",
    ] as CustomerOddsFreshness[]) {
      expect(customerOddsFreshnessStates).toContain(state);
    }
    expect(customerOddsFreshnessStates).toHaveLength(4);
  });

  /*
   * The old vocabulary must be gone rather than tolerated alongside the new.
   * Accepting `FRESH` would let a producer keep emitting it and a reader keep
   * treating AGING as actionable.
   */
  it("no longer accepts the collapsed vocabulary", () => {
    expect(customerOddsFreshnessStates).not.toContain(
      "FRESH" as CustomerOddsFreshness,
    );
  });
});
