import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { evaluatePriceValidity } from "@velyq/analytics/price-validity";

/**
 * The watch threshold a customer is shown must come from the price-validity
 * policy, not from a view's own arithmetic.
 *
 * Browser QA on real data showed "Interesting from 7.58+" for Moreirense —
 * Benfica. That number was produced in the Today view as
 * `Number(match.fairOdds) * 1.03`: a 3% margin no policy defines, in
 * floating point, applied to a value the decision engine had not endorsed.
 * The authoritative module's policy margin is 2%, so the correct figure for
 * the same fixture is 7.50.
 */

const MOREIRENSE_BENFICA = {
  /* Exactly as the columns arrive: NUMERIC(18,8), scale-padded. */
  modelProbability: "0.13600000",
  currentOdds: "13.50000000",
};

const appDirectory = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("price validity comes from the authoritative module", () => {
  it("reproduces the owner-observed fixture from the policy, not a view", () => {
    const validity = evaluatePriceValidity(MOREIRENSE_BENFICA);

    expect(validity.policyVersion).toBe("price-validity.v1");
    /* 1 / 0.136 */
    expect(validity.breakEvenOdds).toBe("7.35294118");
    /* (1 + 0.02) / 0.136 -- the policy margin, not the view's 3%. */
    expect(validity.minimumAcceptableOdds).toBe("7.5");
    /* p * odds - 1 = 0.136 * 13.5 - 1 */
    expect(validity.expectedValue).toBe("0.836");
    expect(validity.status).toBe("ATTRACTIVE");
  });

  it("distinguishes break-even from the lowest acceptable price", () => {
    /*
     * The module documents why: an earlier implementation reported the same
     * number as both, which invited reading break-even as a price worth
     * taking. Minimum acceptable must sit strictly above it.
     */
    const validity = evaluatePriceValidity(MOREIRENSE_BENFICA);
    expect(Number(validity.minimumAcceptableOdds)).toBeGreaterThan(
      Number(validity.breakEvenOdds),
    );
  });

  it("reports unavailable rather than guessing when an input is missing", () => {
    for (const input of [
      { modelProbability: null, currentOdds: "13.5" },
      { modelProbability: "0.136", currentOdds: null },
    ]) {
      const validity = evaluatePriceValidity(input);
      expect(validity.status).toBe("UNAVAILABLE");
      expect(validity.minimumAcceptableOdds).toBeNull();
    }
  });

  it("no customer view derives a price threshold of its own", () => {
    /*
     * A source guard rather than a rendering assertion: the defect was not a
     * wrong pixel, it was a second implementation of a policy. This fails if
     * any customer surface starts multiplying a price again.
     */
    const views = [
      "app/today/today-view.tsx",
      "app/edge/edge-view.tsx",
      "app/radar/radar-view.tsx",
      "app/matches/[id]/page.tsx",
    ];

    for (const view of views) {
      /*
       * Comments are stripped first. The explanatory note left where the
       * derivation used to live quotes the old expression verbatim, and a
       * guard that cannot tell code from prose would either fail on the
       * explanation or force the explanation to be deleted.
       */
      const source = readFileSync(join(appDirectory, view), "utf8")
        .replaceAll(/\/\*[\s\S]*?\*\//g, "")
        .replaceAll(/\/\/.*/g, "");
      expect(source, `${view} multiplies fairOdds`).not.toMatch(
        /fairOdds\s*\)?\s*\*/,
      );
      expect(source, `${view} applies a hand-rolled margin`).not.toMatch(
        /\*\s*1\.0[0-9]/,
      );
    }
  });
});
