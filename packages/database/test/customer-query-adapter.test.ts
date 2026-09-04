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
