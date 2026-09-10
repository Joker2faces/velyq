import { describe, expect, it } from "vitest";
import {
  buildMarketSnapshot,
  type RawBookmakerObservation,
} from "../src/market-snapshot.js";

const T1 = "2026-09-10T12:00:00.000Z";
const T2 = "2026-09-10T13:00:00.000Z";

function obs(
  bookmakerId: string,
  outcomeCode: string,
  decimalOdds: string,
  providerObservedAt = T1,
): RawBookmakerObservation {
  return {
    bookmakerId,
    outcomeCode,
    decimalOdds: decimalOdds as never,
    providerObservedAt,
  };
}

describe("buildMarketSnapshot", () => {
  it("returns null with no observations at all", () => {
    expect(buildMarketSnapshot([], ["HOME", "DRAW", "AWAY"])).toBeNull();
  });

  it("builds a consensus only from bookmakers complete across every required outcome", () => {
    const snapshot = buildMarketSnapshot(
      [
        // book-a: complete 1X2
        obs("book-a", "HOME", "2"),
        obs("book-a", "DRAW", "3.4"),
        obs("book-a", "AWAY", "3.8"),
        // book-b: complete 1X2
        obs("book-b", "HOME", "2.05"),
        obs("book-b", "DRAW", "3.3"),
        obs("book-b", "AWAY", "3.7"),
        // book-c: PARTIAL -- only quotes HOME, must not silently join consensus
        obs("book-c", "HOME", "2.1"),
      ],
      ["HOME", "DRAW", "AWAY"],
    );

    expect(snapshot).not.toBeNull();
    expect(snapshot!.bookmakerCount).toBe(3);
    expect(snapshot!.completeBookmakerCount).toBe(2);
    expect(snapshot!.consensus).not.toBeNull();
    expect(snapshot!.consensus!.bookmakerCoverage).toBe(2);

    // HOME best price is book-c's 2.10 even though it never enters consensus.
    const home = snapshot!.outcomes.find((o) => o.outcomeCode === "HOME")!;
    expect(home.bestOdds).toBe("2.1");
    expect(home.bookmakerCount).toBe(3);
  });

  it("reports no consensus when no bookmaker's book is complete", () => {
    const snapshot = buildMarketSnapshot(
      [obs("book-a", "HOME", "2"), obs("book-b", "AWAY", "3.7")],
      ["HOME", "DRAW", "AWAY"],
    );
    expect(snapshot).not.toBeNull();
    expect(snapshot!.completeBookmakerCount).toBe(0);
    expect(snapshot!.consensus).toBeNull();
  });

  it("never mixes observations from two different provider instants into one snapshot", () => {
    const snapshot = buildMarketSnapshot(
      [
        // Stale instant: book-a complete at T1.
        obs("book-a", "HOME", "2", T1),
        obs("book-a", "DRAW", "3.4", T1),
        obs("book-a", "AWAY", "3.8", T1),
        // Latest instant: only book-b, only HOME -- incomplete.
        obs("book-b", "HOME", "2.2", T2),
      ],
      ["HOME", "DRAW", "AWAY"],
    );

    expect(snapshot).not.toBeNull();
    // Must use T2 (the latest instant) and refuse to borrow book-a's T1
    // DRAW/AWAY prices to complete book-b's book.
    expect(snapshot!.observedAt).toBe(T2);
    expect(snapshot!.completeBookmakerCount).toBe(0);
    expect(snapshot!.consensus).toBeNull();
    expect(snapshot!.bookmakerCount).toBe(1);
  });

  it("ignores observations after asOf, never leaking a future price into a historical snapshot", () => {
    const snapshot = buildMarketSnapshot(
      [
        obs("book-a", "HOME", "2", T1),
        obs("book-a", "DRAW", "3.4", T1),
        obs("book-a", "AWAY", "3.8", T1),
        obs("book-a", "HOME", "9", T2),
      ],
      ["HOME", "DRAW", "AWAY"],
      { asOf: new Date(T1) },
    );
    expect(snapshot).not.toBeNull();
    expect(snapshot!.observedAt).toBe(T1);
    const home = snapshot!.outcomes.find((o) => o.outcomeCode === "HOME")!;
    expect(home.bestOdds).toBe("2");
  });

  it("flags an outlier price only when enough peers exist to measure it against", () => {
    const snapshot = buildMarketSnapshot(
      [
        obs("book-a", "HOME", "2"),
        obs("book-b", "HOME", "2.05"),
        obs("book-c", "HOME", "1.95"),
        obs("book-d", "HOME", "2.02"),
        // Wildly off the other four -- a real outlier candidate.
        obs("book-e", "HOME", "5"),
      ],
      ["HOME"],
    );
    expect(snapshot).not.toBeNull();
    expect(snapshot!.outlierCandidates).toHaveLength(1);
    expect(snapshot!.outlierCandidates[0]!.bookmakerId).toBe("book-e");
  });

  it("never flags an outlier with fewer than the minimum peer quotes", () => {
    const snapshot = buildMarketSnapshot(
      [obs("book-a", "HOME", "2"), obs("book-b", "HOME", "9")],
      ["HOME"],
    );
    expect(snapshot).not.toBeNull();
    expect(snapshot!.outlierCandidates).toHaveLength(0);
  });

  it("rejects zero, negative, and non-numeric odds rather than admitting them as quotes", () => {
    const snapshot = buildMarketSnapshot(
      [
        obs("book-a", "HOME", "0"),
        obs("book-b", "HOME", "-2"),
        obs("book-c", "HOME", "not-a-number"),
        obs("book-d", "HOME", "1"),
        obs("book-e", "HOME", "2.1"),
      ],
      ["HOME"],
    );
    expect(snapshot).not.toBeNull();
    const home = snapshot!.outcomes.find((o) => o.outcomeCode === "HOME")!;
    // Odds must exceed 1 (decimalOdds' own invariant): only book-e survives.
    expect(home.bookmakerCount).toBe(1);
    expect(home.bestOdds).toBe("2.1");
  });

  it("excludes an event market with an odds document containing an invalid outcome from otherwise-complete books", () => {
    const snapshot = buildMarketSnapshot(
      [
        obs("book-a", "HOME", "2"),
        obs("book-a", "DRAW", "3.4"),
        obs("book-a", "AWAY", "0"), // invalid: dropped, book-a is no longer complete
      ],
      ["HOME", "DRAW", "AWAY"],
    );
    expect(snapshot).not.toBeNull();
    expect(snapshot!.completeBookmakerCount).toBe(0);
    expect(snapshot!.consensus).toBeNull();
  });

  it("computes an exact decimal median for an even number of quotes, never a float approximation", () => {
    const snapshot = buildMarketSnapshot(
      [obs("book-a", "HOME", "1.91"), obs("book-b", "HOME", "1.95")],
      ["HOME"],
    );
    expect(snapshot).not.toBeNull();
    const home = snapshot!.outcomes.find((o) => o.outcomeCode === "HOME")!;
    // (1.91 + 1.95) / 2 = 1.93 exactly -- a float mean of these two values
    // can drift by float epsilon; the decimal result must not.
    expect(home.medianOdds).toBe("1.93");
  });

  it("computes an exact decimal deviation ratio for outlier detection, not a float division", () => {
    const snapshot = buildMarketSnapshot(
      [
        obs("book-a", "HOME", "2"),
        obs("book-b", "HOME", "2"),
        obs("book-c", "HOME", "2"),
        obs("book-d", "HOME", "2"),
        // median is 2; this quote deviates by exactly (2.5-2)/2 = 0.25, over threshold.
        obs("book-e", "HOME", "2.5"),
      ],
      ["HOME"],
    );
    expect(snapshot).not.toBeNull();
    expect(snapshot!.outlierCandidates).toHaveLength(1);
    expect(snapshot!.outlierCandidates[0]!.deviationRatio).toBe("0.25");
  });

  it("treats a duplicate bookmaker+outcome observation at the same instant deterministically", () => {
    // A provider anomaly: the same bookmaker reports two different prices
    // for the same outcome at the identical instant. The snapshot must not
    // silently average or randomly pick between them depending on array
    // order -- it resolves to whichever the input lists last, which is
    // deterministic given a stably-ordered query, and never crashes or
    // produces NaN.
    const snapshot = buildMarketSnapshot(
      [obs("book-a", "HOME", "2"), obs("book-a", "HOME", "2.2")],
      ["HOME"],
    );
    expect(snapshot).not.toBeNull();
    const home = snapshot!.outcomes.find((o) => o.outcomeCode === "HOME")!;
    expect(home.bookmakerCount).toBe(1);
    expect(home.bestOdds).toBe("2.2");
  });
});
