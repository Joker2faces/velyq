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

  it("customerToday (the live export) reflects the current real clock", async () => {
    delete process.env["VELYQ_DEMO_CLOCK"];
    // The module is cached (with a fixed clock) by earlier tests in this file.
    vi.resetModules();
    const { customerToday } = await import("../app/customer-data");
    const asOf = new Date(customerToday.asOf).getTime();
    expect(Math.abs(Date.now() - asOf)).toBeLessThan(60_000);
  });
});
