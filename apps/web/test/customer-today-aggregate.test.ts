import { describe, expect, it } from "vitest";
import type { CustomerMatchDto, RecommendationStatus } from "@velyq/contracts";
import { summariseTodayAggregate } from "../app/customer-today-aggregate";

/**
 * "Why nothing today?" (backlog P1-P): the customer-facing counts a Today
 * empty state now cites must be real, computed from the same fixtures Today
 * itself renders -- not a stock sentence indistinguishable from a day with
 * zero fixtures at all.
 */
function match(
  recommendation: RecommendationStatus,
  lineup: CustomerMatchDto["lineup"] = "OFFICIAL",
): Pick<CustomerMatchDto, "recommendation" | "lineup"> {
  return { recommendation, lineup };
}

describe("summariseTodayAggregate", () => {
  it("is all zero for an empty day", () => {
    const summary = summariseTodayAggregate([]);
    expect(summary.totalFixtures).toBe(0);
    expect(summary.lineupGated).toBe(0);
    expect(Object.values(summary.byRecommendation).every((n) => n === 0)).toBe(
      true,
    );
  });

  it("counts every fixture exactly once, by its own recommendation", () => {
    const matches = [
      match("STRONG_EDGE"),
      match("NO_BET"),
      match("NO_BET"),
      match("WAIT"),
      match("INSUFFICIENT_DATA"),
    ] as unknown as CustomerMatchDto[];

    const summary = summariseTodayAggregate(matches);

    expect(summary.totalFixtures).toBe(5);
    expect(summary.byRecommendation.STRONG_EDGE).toBe(1);
    expect(summary.byRecommendation.NO_BET).toBe(2);
    expect(summary.byRecommendation.WAIT).toBe(1);
    expect(summary.byRecommendation.INSUFFICIENT_DATA).toBe(1);
    expect(summary.byRecommendation.WAIT_FOR_LINEUP).toBe(0);
    expect(summary.byRecommendation.EDGE_DISAPPEARED).toBe(0);
  });

  it("counts a fixture as lineup-gated by either a missing lineup or the WAIT_FOR_LINEUP status", () => {
    const matches = [
      match("WAIT", "MISSING"),
      match("WAIT_FOR_LINEUP", "EXPECTED"),
      match("STRONG_EDGE", "OFFICIAL"),
    ] as unknown as CustomerMatchDto[];

    expect(summariseTodayAggregate(matches).lineupGated).toBe(2);
  });
});
