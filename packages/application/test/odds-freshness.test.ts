import { describe, expect, it } from "vitest";

import {
  AGING_WITHIN_MINUTES,
  CURRENT_WITHIN_MINUTES,
  ODDS_FRESHNESS_POLICY_VERSION,
  assessOddsFreshness,
  oddsRefreshDue,
  oddsRefreshIntervalMinutes,
} from "../src/odds-freshness.js";

const NOW = new Date("2026-09-09T12:00:00.000Z");

function minutesAgo(minutes: number): Date {
  return new Date(NOW.getTime() - minutes * 60_000);
}

describe("odds freshness policy", () => {
  it("treats a recent observation as the current market", () => {
    const assessment = assessOddsFreshness(minutesAgo(10), NOW);
    expect(assessment.freshness).toBe("CURRENT");
    expect(assessment.actionable).toBe(true);
    expect(assessment.ageMinutes).toBe(10);
  });

  it("reports a missing observation as unavailable, never as stale data", () => {
    const assessment = assessOddsFreshness(null, NOW);
    expect(assessment.freshness).toBe("UNAVAILABLE");
    expect(assessment.ageMinutes).toBeNull();
    expect(assessment.actionable).toBe(false);
  });

  it("separates aging from stale, and neither is actionable", () => {
    expect(
      assessOddsFreshness(minutesAgo(CURRENT_WITHIN_MINUTES + 1), NOW)
        .freshness,
    ).toBe("AGING");
    expect(
      assessOddsFreshness(minutesAgo(AGING_WITHIN_MINUTES + 1), NOW).freshness,
    ).toBe("STALE");

    /*
     * AGING is deliberately not actionable. It is genuine data and still
     * useful as evidence and as movement history, but the product's claim is
     * that a stated edge reflects a market the customer can bet into, and an
     * hour-old line does not support that claim.
     */
    for (const age of [CURRENT_WITHIN_MINUTES + 1, AGING_WITHIN_MINUTES + 1]) {
      expect(assessOddsFreshness(minutesAgo(age), NOW).actionable).toBe(false);
    }
  });

  it("holds the boundaries exactly, so the classification cannot drift by a minute", () => {
    expect(
      assessOddsFreshness(minutesAgo(CURRENT_WITHIN_MINUTES), NOW).freshness,
    ).toBe("CURRENT");
    expect(
      assessOddsFreshness(minutesAgo(AGING_WITHIN_MINUTES), NOW).freshness,
    ).toBe("AGING");
  });

  it("refuses to call a day-old price current, which is the defect this exists for", () => {
    /*
     * The production audit found the newest observation in the database was
     * 27 hours old and was still being treated as the live market, which made
     * every derived edge a statement about yesterday.
     */
    const assessment = assessOddsFreshness(minutesAgo(27 * 60), NOW);
    expect(assessment.freshness).toBe("STALE");
    expect(assessment.actionable).toBe(false);
  });

  it("tolerates small clock skew rather than treating it as an error", () => {
    const assessment = assessOddsFreshness(
      new Date(NOW.getTime() + 5_000),
      NOW,
    );
    expect(assessment.ageMinutes).toBe(0);
    expect(assessment.freshness).toBe("CURRENT");
  });

  it("carries a policy version so a past verdict can be re-read against its own rule", () => {
    expect(assessOddsFreshness(minutesAgo(1), NOW).policyVersion).toBe(
      ODDS_FRESHNESS_POLICY_VERSION,
    );
    expect(ODDS_FRESHNESS_POLICY_VERSION).toMatch(
      /^odds-freshness-policy-v\d+$/,
    );
  });

  describe("refresh due", () => {
    it("uses exactly the same boundary the decision engine uses", () => {
      /*
       * If these two ever diverged the pipeline would settle into either
       * refreshing prices it would then refuse to act on, or acting on prices
       * it never refreshes.
       */
      for (const age of [0, 10, CURRENT_WITHIN_MINUTES]) {
        expect(oddsRefreshDue(minutesAgo(age), NOW)).toBe(false);
      }
      for (const age of [
        CURRENT_WITHIN_MINUTES + 1,
        AGING_WITHIN_MINUTES + 1,
        27 * 60,
      ]) {
        expect(oddsRefreshDue(minutesAgo(age), NOW)).toBe(true);
      }
    });

    it("treats a fixture with no price at all as due", () => {
      expect(oddsRefreshDue(null, NOW)).toBe(true);
    });
  });
});

describe("kickoff-aware refresh cadence", () => {
  const kickoff = (hoursAway: number) =>
    new Date(NOW.getTime() + hoursAway * 3_600_000);

  it("tightens the interval as kickoff approaches", () => {
    /*
     * A flat interval would spend the day's odds allocation chronologically,
     * exhausting it during the quiet morning and leaving the evening
     * kickoffs unpriced.
     */
    expect(oddsRefreshIntervalMinutes(kickoff(0.5), NOW)).toBe(15);
    expect(oddsRefreshIntervalMinutes(kickoff(2), NOW)).toBe(30);
    expect(oddsRefreshIntervalMinutes(kickoff(8), NOW)).toBe(120);
    expect(oddsRefreshIntervalMinutes(kickoff(30), NOW)).toBe(360);
  });

  it("holds a far-out fixture back even once its price stops being actionable", () => {
    /* Not CURRENT any more, but nowhere near worth another request yet. */
    expect(oddsRefreshDue(minutesAgo(60), NOW, kickoff(30))).toBe(false);
    expect(oddsRefreshDue(minutesAgo(361), NOW, kickoff(30))).toBe(true);
  });

  it("refreshes an imminent fixture as soon as its price stops being actionable", () => {
    /*
     * The interval gates how eagerly a price is *re*-requested once it is no
     * longer actionable; it never forces a request while the existing price
     * is still current, however close kickoff is. So a 50-minute-old price
     * on a fixture half an hour away is due immediately (past both the
     * 45-minute actionable boundary and the 15-minute near-kickoff
     * interval), while a 20-minute-old one is not due at all.
     */
    expect(oddsRefreshDue(minutesAgo(50), NOW, kickoff(0.5))).toBe(true);
    expect(oddsRefreshDue(minutesAgo(20), NOW, kickoff(0.5))).toBe(false);
  });

  it("always requests a first price, at any distance from kickoff", () => {
    expect(oddsRefreshDue(null, NOW, kickoff(30))).toBe(true);
  });

  it("stops refreshing once a fixture has kicked off", () => {
    /*
     * The closing price is whatever was last observed. Watching an in-play
     * market the product does not price would take budget from a fixture
     * that still has a decision left in it.
     */
    expect(oddsRefreshDue(minutesAgo(600), NOW, kickoff(-0.1))).toBe(false);
  });

  it("never refreshes a price that is still actionable", () => {
    for (const hours of [0.5, 2, 8, 30]) {
      expect(oddsRefreshDue(minutesAgo(5), NOW, kickoff(hours))).toBe(false);
    }
  });
});

describe("scheduling on when we last asked", () => {
  const kickoff = (hoursAway: number) =>
    new Date(NOW.getTime() + hoursAway * 3_600_000);

  it("does not re-buy a price the provider already reported as hours old", () => {
    /*
     * The provider's `update` timestamp is frequently well in the past, so a
     * price can arrive already outside the actionable window. Scheduling on
     * it alone made a fixture permanently due: four consecutive live passes
     * each spent a request and wrote nothing but eighteen duplicates.
     */
    const providerSaysTwoHoursOld = minutesAgo(120);
    const weJustAsked = minutesAgo(1);

    expect(
      oddsRefreshDue(providerSaysTwoHoursOld, NOW, kickoff(6), weJustAsked),
    ).toBe(false);
  });

  it("becomes due again once our own interval has elapsed", () => {
    /* 2h band at six hours out; asked 121 minutes ago. */
    expect(
      oddsRefreshDue(minutesAgo(300), NOW, kickoff(6), minutesAgo(121)),
    ).toBe(true);
  });

  it("still refuses to spend on a price that is already actionable", () => {
    expect(
      oddsRefreshDue(minutesAgo(5), NOW, kickoff(6), minutesAgo(600)),
    ).toBe(false);
  });

  it("falls back to the provider timestamp when we have never asked", () => {
    expect(oddsRefreshDue(minutesAgo(400), NOW, kickoff(6), null)).toBe(true);
  });
});
