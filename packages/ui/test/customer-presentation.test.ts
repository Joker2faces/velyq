import { describe, expect, it } from "vitest";

import {
  classifyCustomerMatch,
  movementLabel,
  selectionLabel,
  summariseCustomerMatches,
  type SummarisableMatch,
} from "../src/index.js";

/**
 * Regressions for defects found by authenticated browser QA against real
 * data, not by unit tests: an internal translation key printed as a
 * customer's selection, and a movement figure that could not be established
 * being announced as "Price unchanged".
 */

describe("selection labels", () => {
  it("translates the canonical outcome codes the read model emits", () => {
    expect(selectionLabel("HOME", "en")).toBe("Home win");
    expect(selectionLabel("DRAW", "en")).toBe("Draw");
    expect(selectionLabel("AWAY", "en")).toBe("Away win");
  });

  it("translates them in Greek", () => {
    expect(selectionLabel("HOME", "el")).toBe("Νίκη γηπεδούχου");
    expect(selectionLabel("DRAW", "el")).toBe("Ισοπαλία");
    expect(selectionLabel("AWAY", "el")).toBe("Νίκη φιλοξενούμενου");
  });

  it("never prints the stored label key, which is what reached production", () => {
    /*
     * `market.outcome_definitions.label_key` holds "outcome.home". The map
     * was keyed on the demo corpus's display strings, so real data missed
     * every entry and the fallback returned the key verbatim.
     */
    for (const locale of ["en", "el"] as const) {
      for (const key of ["outcome.home", "outcome.draw", "outcome.away"]) {
        const label = selectionLabel(key, locale);
        expect(label).not.toContain("outcome.");
        expect(label).not.toBe(key);
      }
    }
  });

  it("refuses to print anything shaped like an internal identifier", () => {
    for (const internal of [
      "outcome.over",
      "market.ft_1x2",
      "market.over_2_5",
      "INSUFFICIENT_DATA",
      "NO_ODDS_AT_CUTOFF",
    ]) {
      expect(selectionLabel(internal, "en")).toBe("—");
    }
  });

  it("still passes through a real market line the provider states", () => {
    /* "Over 2.5" is what Greek betting markets print; not an identifier. */
    expect(selectionLabel("Over 2.5", "en")).toBe("Over 2.5");
  });
});

describe("movement labels", () => {
  it("does not call an unestablishable movement 'unchanged'", () => {
    /*
     * The production contradiction: rows showing "1.27 → 1.30" alongside
     * "Price unchanged". Insufficient history must read as unknown.
     */
    const label = movementLabel("INSUFFICIENT_HISTORY", null, "en");
    expect(label).toBe("Insufficient history");
    expect(label).not.toMatch(/unchanged/i);
  });

  it("says unchanged only when the price genuinely held", () => {
    expect(movementLabel("UNCHANGED", "0", "en")).toBe("Price unchanged");
  });

  it("describes a real move by its direction", () => {
    expect(movementLabel("MOVED", "0.0236", "en")).toBe("Price drifted out");
    expect(movementLabel("MOVED", "-0.0236", "en")).toBe("Price shortened in");
  });

  it("reports movement in Greek without claiming stability", () => {
    expect(movementLabel("INSUFFICIENT_HISTORY", null, "el")).toBe(
      "Ανεπαρκές ιστορικό",
    );
    expect(movementLabel("MOVED", "0.0236", "el")).toBe("Η απόδοση ανέβηκε");
  });

  it("keeps movement independent of freshness", () => {
    /*
     * A stale price may still have moved. Movement describes history;
     * freshness describes age. Collapsing one into the other is how "out of
     * date" became "unchanged".
     */
    expect(movementLabel("MOVED", "0.0236", "en")).toBe("Price drifted out");
  });
});

describe("today count reconciliation", () => {
  function match(
    overrides: Partial<SummarisableMatch> = {},
  ): SummarisableMatch {
    return {
      recommendation: "WAIT",
      modelProbability: "0.5",
      quality: { grade: "B" },
      ...overrides,
    };
  }

  it("puts every match in exactly one bucket", () => {
    const matches = [
      match({ recommendation: "STRONG_EDGE" }),
      match({ recommendation: "EDGE" }),
      match({ recommendation: "NO_BET" }),
      match({ recommendation: "WAIT" }),
      match({ recommendation: "WAIT_FOR_LINEUP" }),
      match({ recommendation: "INSUFFICIENT_DATA", modelProbability: null }),
      match({ quality: { grade: "F" } }),
      match({ recommendation: "EDGE_DISAPPEARED" }),
    ];

    const summary = summariseCustomerMatches(matches);

    expect(summary.tracked).toBe(8);
    expect(
      summary.actionable + summary.blocked + summary.watch + summary.noBet,
    ).toBe(summary.tracked);
  });

  it("counts a match that is both waiting and quality-blocked exactly once", () => {
    /*
     * The overlap the four independent filters could not represent: with a
     * forecast, a WAIT recommendation and a failing grade, this match
     * satisfied both "watch" and "blocked".
     */
    const matches = [
      match({ recommendation: "WAIT", quality: { grade: "F" } }),
    ];
    const summary = summariseCustomerMatches(matches);

    expect(summary.tracked).toBe(1);
    expect(summary.blocked).toBe(1);
    expect(summary.watch).toBe(0);
    expect(
      summary.actionable + summary.blocked + summary.watch + summary.noBet,
    ).toBe(1);
  });

  it("reports forecasts separately, because a forecast can exist in any bucket", () => {
    const summary = summariseCustomerMatches([
      match({ recommendation: "STRONG_EDGE" }),
      match({ quality: { grade: "F" } }),
      match({ recommendation: "INSUFFICIENT_DATA", modelProbability: null }),
    ]);

    expect(summary.forecastable).toBe(2);
    /* Deliberately not part of the partition sum. */
    expect(
      summary.actionable + summary.blocked + summary.watch + summary.noBet,
    ).toBe(3);
  });

  it("reconciles for any combination of states", () => {
    const recommendations = [
      "STRONG_EDGE",
      "EDGE",
      "NO_BET",
      "WAIT",
      "WAIT_FOR_LINEUP",
      "EDGE_DISAPPEARED",
      "INSUFFICIENT_DATA",
    ];
    const grades = ["A", "B", "C", "D", "F"];

    const matches = recommendations.flatMap((recommendation) =>
      grades.map((grade) => match({ recommendation, quality: { grade } })),
    );
    const summary = summariseCustomerMatches(matches);

    expect(summary.tracked).toBe(recommendations.length * grades.length);
    expect(
      summary.actionable + summary.blocked + summary.watch + summary.noBet,
    ).toBe(summary.tracked);
    for (const one of matches) {
      expect(["ACTIONABLE", "BLOCKED", "WATCH", "NO_BET"]).toContain(
        classifyCustomerMatch(one),
      );
    }
  });
});
