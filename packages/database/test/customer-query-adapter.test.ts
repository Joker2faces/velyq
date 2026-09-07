import { describe, expect, it } from "vitest";

import {
  suppressionReason,
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
  /*
   * The suppression rule is stated once and reused by the aggregate that
   * counts it, so these cases pin the counted reason rather than a filter
   * that happens to agree with it today.
   */
  describe("suppressionReason", () => {
    const eligible = {
      canonicalCode: "ENG_PREMIER_LEAGUE",
      state: "PRIME",
      customerVisible: true,
    };

    it("admits a reviewed, customer-visible competition", () => {
      expect(suppressionReason(eligible)).toBeNull();
      expect(suppressionReason({ ...eligible, state: "SUPPORTED" })).toBeNull();
    });

    it("fails closed on a competition nobody has reviewed", () => {
      expect(suppressionReason({ ...eligible, canonicalCode: null })).toBe(
        "COMPETITION_NOT_IN_POLICY",
      );
      expect(suppressionReason({ ...eligible, state: null })).toBe(
        "COMPETITION_NOT_IN_POLICY",
      );
    });

    it("names the state that suppressed the competition", () => {
      expect(suppressionReason({ ...eligible, state: "EXPERIMENTAL" })).toBe(
        "COMPETITION_EXPERIMENTAL",
      );
      expect(suppressionReason({ ...eligible, state: "ADMIN_ONLY" })).toBe(
        "COMPETITION_ADMIN_ONLY",
      );
      expect(suppressionReason({ ...eligible, state: "EXCLUDED" })).toBe(
        "COMPETITION_EXCLUDED",
      );
    });

    it("respects the customer-visible flag independently of the state", () => {
      /*
       * A PRIME competition may still be withheld. The flag is a separate
       * lever from the state and treating either as implying the other would
       * quietly publish a competition an operator had switched off.
       */
      expect(suppressionReason({ ...eligible, customerVisible: false })).toBe(
        "COMPETITION_PRIME",
      );
      expect(suppressionReason({ ...eligible, customerVisible: null })).toBe(
        "COMPETITION_PRIME",
      );
    });
  });
});
