import { describe, expect, it } from "vitest";
import {
  assessTiming,
  customerPresentation,
  fortressEvidenceSatisfied,
  FINAL_EVALUATION_WINDOW_MINUTES,
  LINEUP_EXPECTED_WITHIN_MINUTES,
  type DecisionLifecycleState,
  type TimingInput,
} from "../src/decision-timing.js";

/** Good evidence in every respect except the lineup. */
function usable(overrides: Partial<TimingInput> = {}): TimingInput {
  return {
    minutesToKickoff: 1440,
    lineup: "LINEUP_NOT_PUBLISHED_YET",
    marketCoverageSufficient: true,
    priceFresh: true,
    modelEstimateAvailable: true,
    uncertaintyAvailable: true,
    ...overrides,
  };
}

describe("early markets", () => {
  it("does not blame a market for a lineup that cannot exist yet", () => {
    /*
     * The whole point of the phase. At T-24h no fixture anywhere has a
     * published XI, so scoring its absence as a quality failure told the
     * owner a working pipeline was broken, dozens of times a day.
     */
    const assessment = assessTiming(usable({ minutesToKickoff: 1440 }));
    expect(assessment.state).toBe("WATCH");
    expect(assessment.lineupCountsAgainstQuality).toBe(false);
    expect(assessment.reasonCodes).toContain("LINEUP_PENDING_NOT_YET_DUE");
    expect(assessment.finalEvaluationDue).toBe(false);
  });

  it("holds a market with unusable evidence at early research, not watch", () => {
    // Two bookmakers is not "early", it is inadequate, and saying so plainly
    // is more useful than a lifecycle state.
    for (const gap of [
      {
        marketCoverageSufficient: false,
        code: "INSUFFICIENT_BOOKMAKER_COVERAGE",
      },
      { priceFresh: false, code: "STALE_MARKET" },
      { modelEstimateAvailable: false, code: "NO_MODEL_ESTIMATE" },
    ] as const) {
      const assessment = assessTiming(usable(gap));
      expect(assessment.state).toBe("EARLY_RESEARCH");
      expect(assessment.reasonCodes).toContain(gap.code);
    }
  });

  it("says when to look again rather than leaving it to a poll loop", () => {
    const assessment = assessTiming(usable({ minutesToKickoff: 600 }));
    expect(assessment.nextReviewInMinutes).toBe(
      600 - LINEUP_EXPECTED_WITHIN_MINUTES,
    );
  });
});

describe("the final window", () => {
  it("waits for a lineup that is overdue rather than deciding without it", () => {
    const assessment = assessTiming(
      usable({ minutesToKickoff: LINEUP_EXPECTED_WITHIN_MINUTES - 5 }),
    );
    expect(assessment.state).toBe("WAIT_FOR_LINEUP");
    expect(assessment.lineupCountsAgainstQuality).toBe(true);
    expect(assessment.reasonCodes).toContain("LINEUP_EXPECTED_BUT_ABSENT");
    expect(assessment.finalEvaluationDue).toBe(false);
  });

  it("opens the final evaluation once the lineup is confirmed", () => {
    const assessment = assessTiming(
      usable({ minutesToKickoff: 40, lineup: "LINEUP_AVAILABLE" }),
    );
    expect(assessment.state).toBe("READY_FOR_FINAL_EVALUATION");
    expect(assessment.finalEvaluationDue).toBe(true);
    expect(assessment.lineupCountsAgainstQuality).toBe(false);
    expect(assessment.reasonCodes).toContain("LINEUP_CONFIRMED");
  });

  it("still refuses to evaluate a confirmed lineup on bad evidence", () => {
    const assessment = assessTiming(
      usable({
        minutesToKickoff: 40,
        lineup: "LINEUP_AVAILABLE",
        marketCoverageSufficient: false,
      }),
    );
    expect(assessment.state).toBe("WATCH");
    expect(assessment.finalEvaluationDue).toBe(false);
  });

  it("closes everything once the match has started", () => {
    const assessment = assessTiming(
      usable({ minutesToKickoff: -1, lineup: "LINEUP_AVAILABLE" }),
    );
    expect(assessment.state).toBe("NO_BET");
    expect(assessment.finalEvaluationDue).toBe(false);
    expect(assessment.reasonCodes).toEqual(["EVENT_STARTED"]);
  });
});

describe("competitions with no lineup coverage", () => {
  it("is a separate policy, not a permanent wait", () => {
    /*
     * Holding these at WAIT_FOR_LINEUP forever would be a quiet permanent
     * block dressed up as a temporary one, and the owner would have no way to
     * tell it apart from a provider outage.
     */
    const early = assessTiming(
      usable({ minutesToKickoff: 1440, lineup: "LINEUP_NOT_COVERED" }),
    );
    expect(early.state).toBe("WATCH");
    expect(early.reasonCodes).toContain("LINEUP_NOT_COVERED");
    expect(early.lineupObtainable).toBe(false);
    expect(early.lineupCountsAgainstQuality).toBe(false);
  });

  it("may still reach a final evaluation near kickoff", () => {
    const late = assessTiming(
      usable({
        minutesToKickoff: FINAL_EVALUATION_WINDOW_MINUTES - 10,
        lineup: "LINEUP_NOT_COVERED",
      }),
    );
    expect(late.state).toBe("READY_FOR_FINAL_EVALUATION");
    expect(late.finalEvaluationDue).toBe(true);
  });

  it("reports no bet near kickoff when the evidence is inadequate", () => {
    const late = assessTiming(
      usable({
        minutesToKickoff: 30,
        lineup: "LINEUP_NOT_COVERED",
        priceFresh: false,
      }),
    );
    expect(late.state).toBe("NO_BET");
    expect(late.finalEvaluationDue).toBe(false);
  });

  it("keeps the three lineup cases distinguishable", () => {
    // The distinction the brief insists on: three states, three behaviours.
    const states = (
      [
        "LINEUP_AVAILABLE",
        "LINEUP_NOT_PUBLISHED_YET",
        "LINEUP_NOT_COVERED",
      ] as const
    ).map(
      (lineup) => assessTiming(usable({ minutesToKickoff: 30, lineup })).state,
    );
    /*
     * Only a pending lineup produces a distinct lifecycle state near
     * kickoff: a confirmed lineup and a competition that has none both reach
     * a final evaluation, because both have all the evidence they are ever
     * going to get. The difference between them is not the lifecycle state,
     * it is FORTRESS eligibility — asserted immediately below, and the reason
     * the two cases must not be merged.
     */
    expect(states).toEqual([
      "READY_FOR_FINAL_EVALUATION",
      "WAIT_FOR_LINEUP",
      "READY_FOR_FINAL_EVALUATION",
    ]);
    expect(
      fortressEvidenceSatisfied({
        lineup: "LINEUP_AVAILABLE",
        minutesToKickoff: 30,
      }).satisfied,
    ).toBe(true);
    expect(
      fortressEvidenceSatisfied({
        lineup: "LINEUP_NOT_COVERED",
        minutesToKickoff: 30,
      }).satisfied,
    ).toBe(false);
  });
});

describe("the FORTRESS evidence gate", () => {
  it("requires a confirmed lineup, and is not relaxed by timing", () => {
    // The conservative reading, deliberately unchanged by the lifecycle: an
    // early WATCH state must never become a route to FORTRESS.
    expect(
      fortressEvidenceSatisfied({
        lineup: "LINEUP_AVAILABLE",
        minutesToKickoff: 30,
      }),
    ).toEqual({ satisfied: true, reasonCodes: ["LINEUP_CONFIRMED"] });

    const pending = fortressEvidenceSatisfied({
      lineup: "LINEUP_NOT_PUBLISHED_YET",
      minutesToKickoff: 1440,
    });
    expect(pending.satisfied).toBe(false);
    expect(pending.reasonCodes).toContain("FORTRESS_REQUIRES_LINEUP");
  });

  it("refuses a competition that cannot supply one rather than waiving it", () => {
    // "Nothing better is available" is not a reason to lower the bar.
    const uncovered = fortressEvidenceSatisfied({
      lineup: "LINEUP_NOT_COVERED",
      minutesToKickoff: 30,
    });
    expect(uncovered.satisfied).toBe(false);
    expect(uncovered.reasonCodes).toContain("LINEUP_NOT_COVERED");
  });

  it("refuses a started match even with a lineup", () => {
    expect(
      fortressEvidenceSatisfied({
        lineup: "LINEUP_AVAILABLE",
        minutesToKickoff: 0,
      }).satisfied,
    ).toBe(false);
  });
});

describe("what a customer surface may claim", () => {
  it("presents exactly three states as recommendations", () => {
    const states: readonly DecisionLifecycleState[] = [
      "EARLY_RESEARCH",
      "WATCH",
      "WAIT_FOR_LINEUP",
      "READY_FOR_FINAL_EVALUATION",
      "NO_BET",
      "EDGE",
      "STRONG_EDGE",
      "FORTRESS",
    ];
    const recommendations = states.filter(
      (state) => customerPresentation(state) === "RECOMMENDATION",
    );
    expect(recommendations).toEqual(["EDGE", "STRONG_EDGE", "FORTRESS"]);
  });

  it("shows a watched market as preliminary, never as a pick", () => {
    expect(customerPresentation("WATCH")).toBe("PRELIMINARY");
    expect(customerPresentation("WAIT_FOR_LINEUP")).toBe(
      "AWAITING_FINAL_EVIDENCE",
    );
  });

  it("hides a market with nothing usable to say", () => {
    expect(customerPresentation("EARLY_RESEARCH")).toBe("HIDDEN");
  });
});
