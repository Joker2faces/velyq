import { describe, expect, it } from "vitest";
import {
  closingLineValue,
  settleDecision,
  summarizeMarketConsensus,
} from "../src/index.js";

describe("immutable decision performance primitives", () => {
  it("settles 1X2 and O/U 2.5 without guessing unfinished results", () => {
    expect(
      settleDecision({
        market: "1X2",
        selection: "HOME",
        status: "FINAL",
        homeScore: 2,
        awayScore: 0,
      }),
    ).toBe("WIN");
    expect(
      settleDecision({
        market: "OVER_UNDER_2_5",
        selection: "UNDER",
        status: "FINAL",
        homeScore: 1,
        awayScore: 1,
      }),
    ).toBe("WIN");
    expect(
      settleDecision({
        market: "1X2",
        selection: "AWAY",
        status: "IN_PROGRESS",
      }),
    ).toBe("UNSETTLED");
  });

  it("calculates CLV and labels price disagreement honestly", () => {
    expect(closingLineValue("2" as never, "1.8" as never)).toBe(
      "0.111111111111",
    );
    expect(
      summarizeMarketConsensus(["2" as never, "2.02" as never]),
    ).toMatchObject({ bookmakerCount: 2, stability: "STABLE" });
    expect(
      summarizeMarketConsensus(["1.8" as never, "2.2" as never]).stability,
    ).toBe("FRAGMENTED");
  });
});
