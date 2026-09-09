import { describe, expect, it } from "vitest";
import { reasonLabel } from "@velyq/ui";
import { buildCustomerTodayData } from "../app/customer-data";

/**
 * Why a decision is being withheld is product value, not an error state, so
 * the reason has to read as a sentence in both languages.
 *
 * Today used to translate these through its own EN/EL dictionary in
 * app/customer/forecast-presentation.ts, which covered nine codes and fell
 * back to `code.replaceAll("_", " ")`. `assessDataQuality` emits three codes
 * that dictionary never had, so a customer read "NO BOOKMAKER COVERAGE".
 * There is now one translator-backed source for all of them.
 */
describe("forecast reasons", () => {
  /* Everything assessDataQuality can emit, plus the decision-level codes. */
  const emitted = [
    "MISSING_LINEUP",
    "STALE_DATA",
    "MISSING_PRICE",
    "INSUFFICIENT_COVERAGE",
    "LOW_MAPPING_CONFIDENCE",
    "NO_BOOKMAKER_COVERAGE",
    "LOW_SOURCE_AUTHORITY",
    "INCONSISTENT_DATA",
    "INSUFFICIENT_DATA",
    "EDGE_DISAPPEARED",
    "REPRICED",
  ] as const;

  it.each(["en", "el"] as const)(
    "names every emitted reason in %s",
    (locale) => {
      for (const code of emitted) {
        const label = reasonLabel(code, locale);
        expect(label, code).not.toBe("");
        /* Never the identifier, spaced out or otherwise. */
        expect(label, code).not.toMatch(/^[A-Z0-9_]{2,}$/);
        expect(label, code).not.toBe(code.replaceAll("_", " "));
      }
    },
  );

  it("does not fall back to English prose on a Greek page", () => {
    /*
     * `humanize` produced an English sentence for any unmapped code
     * regardless of locale. An unnameable reason is reported as unavailable
     * instead, which is true in both languages.
     */
    const greek = reasonLabel("SOME_FUTURE_CODE", "el");
    expect(greek).toBe("Μη διαθέσιμο");
    expect(greek).not.toMatch(/[A-Za-z]/);
  });

  it("keeps forecasts useful with zero actionable edges", () => {
    const data = buildCustomerTodayData(new Date("2026-09-08T08:00:00.000Z"));
    const withoutEdge = data.matches.filter(
      (match) => match.recommendation !== "STRONG_EDGE",
    );

    expect(withoutEdge.some((m) => m.modelProbability !== null)).toBe(true);
    expect(withoutEdge.some((m) => m.recommendation === "WAIT")).toBe(true);
    expect(withoutEdge.some((m) => m.recommendation === "NO_BET")).toBe(true);
  });
});
