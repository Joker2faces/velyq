import { describe, expect, it } from "vitest";
import { customerToday } from "../../apps/web/app/customer-data";

describe("customer synthetic scenario matrix", () => {
  it("exposes every required Phase 1 recommendation state", () => {
    const states = new Set(
      customerToday.matches.map((match) => match.recommendation),
    );
    expect([...states]).toEqual(
      expect.arrayContaining([
        "STRONG_EDGE",
        "NO_BET",
        "WAIT",
        "WAIT_FOR_LINEUP",
        "INSUFFICIENT_DATA",
        "EDGE_DISAPPEARED",
      ]),
    );
    expect(
      customerToday.matches.every(
        (match) => match.syntheticLabel === "Synthetic data",
      ),
    ).toBe(true);
  });
  it("keeps numeric prediction fields null for insufficient data", () => {
    const insufficient = customerToday.matches.find(
      (match) => match.recommendation === "INSUFFICIENT_DATA",
    );
    expect(insufficient?.modelProbability).toBeNull();
    expect(insufficient?.expectedValue).toBeNull();
  });
});
