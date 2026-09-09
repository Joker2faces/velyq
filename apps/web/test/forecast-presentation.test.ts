import { describe, expect, it } from "vitest";
import { buildCustomerTodayData } from "../app/customer-data";
import { forecastReason } from "../app/customer/forecast-presentation";
describe("forecast customer presentation", () => {
  const data = buildCustomerTodayData(new Date("2026-09-08T08:00:00.000Z"));
  it("keeps forecasts useful with zero actionable edges", () => {
    const withoutEdge = data.matches.filter(
      (m) => m.recommendation !== "STRONG_EDGE",
    );
    expect(withoutEdge.some((m) => m.modelProbability !== null)).toBe(true);
    expect(withoutEdge.some((m) => m.recommendation === "WAIT")).toBe(true);
    expect(withoutEdge.some((m) => m.recommendation === "NO_BET")).toBe(true);
  });
  it("translates no-market reasons", () => {
    expect(forecastReason("MISSING_PRICE", "el")).toBe(
      "Ανεπαρκή δεδομένα αγοράς",
    );
  });
});
