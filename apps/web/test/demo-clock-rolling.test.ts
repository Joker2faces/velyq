import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The synthetic demo fixtures used to hardcode 2026-09-04 as "today". A
 * visitor on any later date saw a "Snapshot as of 10:00 UTC" and kickoffs
 * that were all in the past — the demo looked broken rather than live. These
 * pin that "today" always tracks the injected clock, on any date.
 */

const FIXED_NOW = "2027-03-15T10:00:00.000Z";

beforeEach(() => {
  process.env["VELYQ_DEMO_CLOCK"] = FIXED_NOW;
});

afterEach(() => {
  delete process.env["VELYQ_DEMO_CLOCK"];
});

/*
 * Every test here pays a dynamic-import cost that is transform-bound under
 * a full parallel run (it once failed on the 5000ms default for that reason
 * alone, never from a logic defect). The timeout that accommodates it now
 * lives once in tooling/vitest/vitest.config.mts.
 */
describe("rolling demo clock", () => {
  it("resolves the injected clock rather than the real current time", async () => {
    const { resolveDemoClock } = await import("../app/demo-clock");
    expect(resolveDemoClock().toISOString()).toBe(FIXED_NOW);
  });

  it("falls back to the real clock when nothing is injected", async () => {
    delete process.env["VELYQ_DEMO_CLOCK"];
    const { resolveDemoClock } = await import("../app/demo-clock");
    const before = Date.now();
    const resolved = resolveDemoClock().getTime();
    const after = Date.now();
    expect(resolved).toBeGreaterThanOrEqual(before);
    expect(resolved).toBeLessThanOrEqual(after);
  });

  it("ignores an unparseable override rather than producing an invalid date", async () => {
    process.env["VELYQ_DEMO_CLOCK"] = "not-a-date";
    const { resolveDemoClock } = await import("../app/demo-clock");
    expect(Number.isNaN(resolveDemoClock().getTime())).toBe(false);
  });

  it("snapshots today's data as of the injected clock, on any date", async () => {
    const { buildCustomerTodayData } = await import("../app/customer-data");
    const data = buildCustomerTodayData(new Date(FIXED_NOW));
    expect(data.asOf).toBe(FIXED_NOW);
    // Every match's featureCutoff is the snapshot time itself.
    for (const match of data.matches) {
      expect(match.trace.featureCutoff).toBe(FIXED_NOW);
    }
  });

  it("keeps kickoffs at the same offsets from the snapshot regardless of date", async () => {
    const { buildCustomerTodayData } = await import("../app/customer-data");
    const a = buildCustomerTodayData(new Date("2027-03-15T10:00:00.000Z"));
    const b = buildCustomerTodayData(new Date("2028-11-02T10:00:00.000Z"));
    const offsetHours = (asOf: string, startsAt: string) =>
      (new Date(startsAt).getTime() - new Date(asOf).getTime()) / 3_600_000;
    for (let i = 0; i < a.matches.length; i += 1) {
      expect(offsetHours(a.asOf, a.matches[i]!.startsAt)).toBeCloseTo(
        offsetHours(b.asOf, b.matches[i]!.startsAt),
        6,
      );
    }
  });

  it("keeps today's matches on the snapshot day and later ones after it", async () => {
    const { buildCustomerTodayData } = await import("../app/customer-data");
    const now = new Date(FIXED_NOW);
    const data = buildCustomerTodayData(now);
    const sameDay = data.matches.filter(
      (m) => new Date(m.startsAt).toDateString() === now.toDateString(),
    );
    const later = data.matches.filter(
      (m) => new Date(m.startsAt).getTime() > now.getTime(),
    );
    expect(sameDay.length).toBeGreaterThan(0);
    expect(later.length).toBe(data.matches.length);
  });

  it("does not change any pinned numeric or identity field across dates", async () => {
    const { buildCustomerTodayData } = await import("../app/customer-data");
    const a = buildCustomerTodayData(new Date("2027-03-15T10:00:00.000Z"));
    const b = buildCustomerTodayData(new Date("2028-11-02T10:00:00.000Z"));
    const withoutDates = (match: (typeof a.matches)[number]) => {
      const { startsAt, trace, ...rest } = match;
      void startsAt;
      const { featureCutoff, ...traceRest } = trace;
      void featureCutoff;
      return { ...rest, trace: traceRest };
    };
    for (let i = 0; i < a.matches.length; i += 1) {
      expect(withoutDates(a.matches[i]!)).toEqual(withoutDates(b.matches[i]!));
    }
  });

  it("customerTodaySnapshot() reads the real clock at call time, not at module load", async () => {
    delete process.env["VELYQ_DEMO_CLOCK"];
    vi.resetModules();
    const { customerTodaySnapshot } = await import("../app/customer-data");
    const asOf = new Date(customerTodaySnapshot().asOf).getTime();
    expect(Math.abs(Date.now() - asOf)).toBeLessThan(60_000);
  });

  /*
   * The deployed Worker rendered "Thursday, 01 January 1970" because the
   * snapshot was a module-level const: Cloudflare evaluates top-level module
   * code during isolate startup, outside a request, where the clock is not
   * real. Importing the module must therefore not, by itself, stamp a
   * timestamp -- the epoch is what that mistake looks like.
   */
  it("does not stamp a timestamp at import time, and never yields the epoch", async () => {
    delete process.env["VELYQ_DEMO_CLOCK"];
    vi.resetModules();
    const module = await import("../app/customer-data");
    expect(module).not.toHaveProperty("customerToday");

    const asOf = new Date(module.customerTodaySnapshot().asOf);
    expect(asOf.getUTCFullYear()).toBeGreaterThan(1970);
  });
});
