import { describe, expect, it } from "vitest";

import {
  ASSUMED_DAILY_LIMIT,
  DAILY_PURPOSE_BUDGET,
  PROVIDER_QUOTA_POLICY_VERSION,
  RECOVERY_RESERVE,
  providerQuotaState,
  purposeRequestBudget,
  shouldProbeQuotaStatus,
  utcQuotaDay,
  type ProviderQuotaSnapshot,
} from "../src/provider-quota.js";

const NOW = new Date("2026-09-09T12:00:00.000Z");
const TODAY = "2026-09-09";

function snapshot(
  overrides: Partial<ProviderQuotaSnapshot> = {},
): ProviderQuotaSnapshot {
  return {
    dailyLimit: 100,
    remaining: 90,
    quotaDay: TODAY,
    observedAt: new Date("2026-09-09T11:00:00.000Z"),
    ...overrides,
  };
}

describe("provider quota policy", () => {
  it("allocates the whole documented daily limit, leaving an unallocated recovery reserve", () => {
    const allocated = Object.values(DAILY_PURPOSE_BUDGET).reduce(
      (total, value) => total + value,
      0,
    );
    /*
     * The reserve exists precisely because it is *not* spendable by any
     * purpose. If the allocation ever grew to consume it, a bad day would
     * leave no room to recover -- so the arithmetic is pinned here rather
     * than trusted to stay right.
     */
    expect(allocated + RECOVERY_RESERVE).toBe(ASSUMED_DAILY_LIMIT);
  });

  describe("state classification", () => {
    it("reports HEALTHY on a comfortable budget", () => {
      expect(providerQuotaState(snapshot(), NOW)).toBe("HEALTHY");
    });

    it("distinguishes never-observed from exhausted", () => {
      expect(providerQuotaState(snapshot({ remaining: null }), NOW)).toBe(
        "UNKNOWN",
      );
      expect(providerQuotaState(snapshot({ remaining: 0 }), NOW)).toBe(
        "EXHAUSTED",
      );
    });

    it("treats yesterday's observation as unknown rather than carrying it into today", () => {
      /*
       * Quota resets at UTC midnight. Reusing a stale figure would either
       * freeze a fresh budget or spend against one already gone.
       */
      const stale = snapshot({ quotaDay: "2026-09-08", remaining: 1 });
      expect(providerQuotaState(stale, NOW)).toBe("UNKNOWN");
    });

    it("reports CRITICAL while the recovery reserve is being eaten", () => {
      expect(
        providerQuotaState(snapshot({ remaining: RECOVERY_RESERVE }), NOW),
      ).toBe("CRITICAL");
      expect(
        providerQuotaState(snapshot({ remaining: RECOVERY_RESERVE + 1 }), NOW),
      ).toBe("CONSERVE");
    });

    it("reports CONSERVE below 30% of the limit", () => {
      expect(providerQuotaState(snapshot({ remaining: 29 }), NOW)).toBe(
        "CONSERVE",
      );
      expect(providerQuotaState(snapshot({ remaining: 30 }), NOW)).toBe(
        "HEALTHY",
      );
    });

    it("falls back to the assumed limit when the provider reports no limit", () => {
      expect(
        providerQuotaState(snapshot({ dailyLimit: null, remaining: 20 }), NOW),
      ).toBe("CONSERVE");
    });
  });

  describe("purpose budgets", () => {
    it("spends nothing at all once exhausted, however much work is waiting", () => {
      const budget = purposeRequestBudget({
        purpose: "ODDS",
        snapshot: snapshot({ remaining: 0 }),
        spentToday: 0,
        candidates: 50,
        now: NOW,
      });
      expect(budget.allowed).toBe(0);
      expect(budget.limitedBy).toBe("QUOTA_EXHAUSTED");
    });

    it("spends nothing while critical, so the reserve stays for recovery", () => {
      const budget = purposeRequestBudget({
        purpose: "ODDS",
        snapshot: snapshot({ remaining: 3 }),
        spentToday: 0,
        candidates: 10,
        now: NOW,
      });
      expect(budget.allowed).toBe(0);
      expect(budget.limitedBy).toBe("QUOTA_CRITICAL");
    });

    it("never exceeds the purpose's own daily allocation", () => {
      const budget = purposeRequestBudget({
        purpose: "DISCOVERY",
        snapshot: snapshot(),
        spentToday: DAILY_PURPOSE_BUDGET.DISCOVERY - 1,
        candidates: 5,
        now: NOW,
      });
      expect(budget.allowed).toBe(1);
    });

    it("stops a purpose once its allocation is spent, even on a healthy budget", () => {
      const budget = purposeRequestBudget({
        purpose: "ODDS",
        snapshot: snapshot({ remaining: 95 }),
        spentToday: DAILY_PURPOSE_BUDGET.ODDS,
        candidates: 10,
        now: NOW,
      });
      expect(budget.allowed).toBe(0);
      expect(budget.limitedBy).toBe("PURPOSE_BUDGET_SPENT");
    });

    it("never spends into the recovery reserve", () => {
      const budget = purposeRequestBudget({
        purpose: "ODDS",
        snapshot: snapshot({ remaining: 12 }),
        spentToday: 0,
        candidates: 40,
        now: NOW,
      });
      /* 12 remaining minus the 7 held back leaves 5 spendable. */
      expect(budget.allowed).toBe(5);
      expect(budget.limitedBy).toBe("RECOVERY_RESERVE");
    });

    it("halves the purpose allocation while conserving", () => {
      const budget = purposeRequestBudget({
        purpose: "ODDS",
        snapshot: snapshot({ remaining: 29 }),
        spentToday: 0,
        candidates: 40,
        now: NOW,
      });
      expect(budget.state).toBe("CONSERVE");
      /* min(candidates 40, purpose 60, spendable 22, throttled 30) */
      expect(budget.allowed).toBe(22);
    });

    it("bounds an unknown quota to a single request rather than freezing or spending freely", () => {
      const budget = purposeRequestBudget({
        purpose: "ODDS",
        snapshot: snapshot({ remaining: null }),
        spentToday: 0,
        candidates: 40,
        now: NOW,
      });
      /*
       * One real request is enough for the response headers to establish the
       * true figure, so the pipeline recovers by doing useful work instead of
       * spending a request purely to inspect the budget.
       */
      expect(budget.allowed).toBe(1);
      expect(budget.limitedBy).toBe("UNKNOWN_QUOTA_PROBE_ONLY");
    });

    it("asks for nothing when there is nothing useful to do, on any budget", () => {
      for (const remaining of [null, 0, 5, 50, 100]) {
        const budget = purposeRequestBudget({
          purpose: "ODDS",
          snapshot: snapshot({ remaining }),
          spentToday: 0,
          candidates: 0,
          now: NOW,
        });
        expect(budget.allowed).toBe(0);
      }
    });
  });

  describe("status probing", () => {
    it("never probes when real work is already planned", () => {
      expect(
        shouldProbeQuotaStatus(snapshot({ remaining: null }), NOW, 1),
      ).toBe(false);
    });

    it("never probes a quota that is already known", () => {
      expect(shouldProbeQuotaStatus(snapshot(), NOW, 0)).toBe(false);
    });

    it("probes only an unknown quota with no work to do", () => {
      expect(
        shouldProbeQuotaStatus(snapshot({ remaining: null }), NOW, 0),
      ).toBe(true);
    });
  });

  it("names the UTC day a quota observation belongs to", () => {
    expect(utcQuotaDay(new Date("2026-09-09T23:59:59.999Z"))).toBe(TODAY);
    expect(utcQuotaDay(new Date("2026-09-10T00:00:00.000Z"))).toBe(
      "2026-09-10",
    );
  });

  it("carries a policy version, so a thin run can be explained later", () => {
    expect(PROVIDER_QUOTA_POLICY_VERSION).toMatch(
      /^provider-quota-policy-v\d+$/,
    );
  });
});
