import { describe, expect, it } from "vitest";

import {
  utcDayWindow,
  type CustomerRawMatch,
  type CustomerRawOddsHistory,
  type CustomerRawToday,
  type CustomerReadModelMapper,
} from "../src/repositories/customer-queries.js";

describe("customer database read boundary", () => {
  it("computes a stable UTC as-of day window", () => {
    const { start, end } = utcDayWindow(new Date("2026-09-04T23:59:59.999Z"));

    expect(start.toISOString()).toBe("2026-09-04T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-09-05T00:00:00.000Z");
  });

  /*
   * The window is pure UTC-calendar arithmetic (setUTCHours/setUTCDate), so
   * it must produce an ordinary 24-hour day even on the two EU DST
   * transition dates -- a local-time implementation would produce a 23- or
   * 25-hour "day" on these specific dates instead. Locked in as a regression
   * test rather than left as an inference from reading the source.
   */
  it.each([
    /* EU spring-forward, 2026-03-29: 01:00 UTC -> 02:00 EET wall clock. */
    [
      "2026-03-29T12:00:00.000Z",
      "2026-03-29T00:00:00.000Z",
      "2026-03-30T00:00:00.000Z",
    ],
    /* EU fall-back, 2026-10-25: 01:00 UTC -> 02:00 EET wall clock, repeated. */
    [
      "2026-10-25T12:00:00.000Z",
      "2026-10-25T00:00:00.000Z",
      "2026-10-26T00:00:00.000Z",
    ],
  ] as const)(
    "produces an ordinary 24h window across the %s EU DST transition",
    (asOf, expectedStart, expectedEnd) => {
      const { start, end } = utcDayWindow(new Date(asOf));

      expect(start.toISOString()).toBe(expectedStart);
      expect(end.toISOString()).toBe(expectedEnd);
      expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
    },
  );

  it("keeps DTO mapping outside the database package", () => {
    const mapper: CustomerReadModelMapper<string> = {
      mapToday: (read: CustomerRawToday) => read.matches.length.toString(),
      mapMatch: (read: CustomerRawMatch) => read.event.id,
      mapOddsHistory: (read: CustomerRawOddsHistory) =>
        read.observations.length.toString(),
    };

    expect(mapper.mapToday).toBeTypeOf("function");
    expect(mapper.mapMatch).toBeTypeOf("function");
    expect(mapper.mapOddsHistory).toBeTypeOf("function");
  });
});
