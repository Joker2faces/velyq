import { describe, expect, it } from "vitest";
import {
  formatDateTime,
  formatDecimal,
  formatPercent,
  message,
} from "../src/index.js";

describe("customer presentation formatting", () => {
  it("formats canonical decimal strings at the presentation boundary", () => {
    expect(formatDecimal("1.666666666666", 2)).toBe("1.67");
    expect(formatDecimal(null)).toBe("—");
  });
  it("formats probabilities and edges", () => {
    expect(formatPercent("0.059459459459")).toBe("+5.9%");
    expect(formatPercent("-0.05")).toBe("-5.0%");
  });
  it("formats ISO timestamps consistently in UTC", () => {
    expect(formatDateTime("2026-09-04T18:30:00.000Z")).toBe(
      "04 Sept 2026, 18:30",
    );
  });
  it("exposes stable English message keys", () => {
    expect(message("navMatchIntelligence")).toBe("Match Intelligence");
    expect(message("syntheticData")).toBe("Synthetic data");
  });
});
