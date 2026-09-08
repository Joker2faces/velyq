import { describe, expect, it } from "vitest";
import { orchestrateResultSettlement } from "../src/index.js";
describe("provider identity result settlement orchestration", () => {
  it("settles supported markets from the provider fixture identity", () => {
    expect(
      orchestrateResultSettlement(
        {
          provider: "API_SPORTS",
          providerFixtureId: "123",
          status: "FINAL",
          homeScore: 2,
          awayScore: 1,
          observedAt: "2026-09-08T10:00:00Z",
        },
        [
          { decisionId: "a", market: "1X2", selection: "HOME" },
          { decisionId: "b", market: "OVER_UNDER_2_5", selection: "OVER" },
        ],
      ).map((item) => item.outcome),
    ).toEqual(["WIN", "WIN"]);
  });
  it("does not guess unfinished or identity-less results", () => {
    expect(
      orchestrateResultSettlement(
        {
          provider: "API_SPORTS",
          providerFixtureId: "123",
          status: "IN_PROGRESS",
          homeScore: null,
          awayScore: null,
          observedAt: "2026-09-08T10:00:00Z",
        },
        [{ decisionId: "a", market: "1X2", selection: "HOME" }],
      )[0]?.outcome,
    ).toBe("UNSETTLED");
    expect(() =>
      orchestrateResultSettlement(
        {
          provider: "API_SPORTS",
          providerFixtureId: "",
          status: "FINAL",
          homeScore: 1,
          awayScore: 0,
          observedAt: "2026-09-08T10:00:00Z",
        },
        [],
      ),
    ).toThrow("RESULT_IDENTITY_REQUIRED");
  });
});
