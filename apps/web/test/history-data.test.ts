import { describe, expect, it } from "vitest";
import { buildDemoHistory } from "../app/customer/history-data";

describe("customer decision history demo", () => {
  it("labels the demo and retains both winning and losing qualifying decisions", () => {
    const history = buildDemoHistory(new Date("2026-09-08T12:00:00.000Z"));
    expect(history.syntheticLabel).toBe("Synthetic data");
    expect(history.decisions).toHaveLength(4);
    expect(history.decisions.map((item) => item.settlement)).toEqual(
      expect.arrayContaining(["WIN", "LOSS", "VOID"]),
    );
  });

  it("keeps decision-time pricing and later outcome distinct", () => {
    const lossWithPositiveClv = buildDemoHistory(new Date()).decisions[0]!;
    expect(lossWithPositiveClv).toMatchObject({
      settlement: "LOSS",
      oddsAtDecision: "1.91",
      closingOdds: "1.71",
      priceQuality: "POSITIVE_CLV",
    });
  });
});
