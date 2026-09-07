import { describe, expect, it } from "vitest";

import { customerDatabaseMapper } from "../app/customer-database";

/*
 * The bug this pins was quiet and wrong in the worst way: the Today response
 * described a *page* while looking like it described a *window*. It read the
 * first hundred events, filtered them in memory, and reported the remainder
 * as suppressed — so a busy Saturday claimed sixty suppressed fixtures out of
 * a genuine three hundred, and nothing about the number looked odd.
 *
 * The counts are now database aggregates over the whole window, and the rule
 * these tests protect is that nothing downstream may recompute them from the
 * rows it happens to be holding.
 */
describe("today coverage counts describe the window, not the page", () => {
  const coverage = {
    eventsInWindow: 267,
    eligible: 140,
    returned: 100,
    pageSize: 100,
    truncated: true,
  };

  function read(matches: readonly never[]) {
    return {
      asOf: new Date("2026-09-08T00:00:00Z"),
      windowStart: new Date("2026-09-08T00:00:00Z"),
      windowEnd: new Date("2026-09-10T00:00:00Z"),
      matches,
      suppressed: { total: 127, byReason: { COMPETITION_NOT_IN_POLICY: 127 } },
      coverage,
    };
  }

  it("carries the aggregates through the mapper untouched", () => {
    const mapped = customerDatabaseMapper.mapToday(read([]));

    /*
     * Zero matches in hand, and the counts still describe two hundred and
     * sixty-seven events. Deriving them from `matches` would produce zeros
     * here, which is precisely the failure being excluded.
     */
    expect(mapped.coverage).toEqual(coverage);
    expect(mapped.matches).toHaveLength(0);
    expect(mapped.suppressed?.total).toBe(127);
  });

  it("keeps eligible and returned distinct when the page is truncated", () => {
    const mapped = customerDatabaseMapper.mapToday(read([]));

    expect(mapped.coverage?.truncated).toBe(true);
    expect(mapped.coverage?.eligible).toBeGreaterThan(
      mapped.coverage?.returned ?? 0,
    );
  });

  it("adds up: eligible plus suppressed accounts for the whole window", () => {
    const mapped = customerDatabaseMapper.mapToday(read([]));
    const eligible = mapped.coverage?.eligible ?? 0;
    const suppressed = mapped.suppressed?.total ?? 0;

    expect(eligible + suppressed).toBe(mapped.coverage?.eventsInWindow);
  });
});
