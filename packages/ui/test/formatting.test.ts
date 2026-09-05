import { describe, expect, it } from "vitest";
import {
  LOCALES,
  barPercent,
  directionOf,
  entitlementLabel,
  formatCount,
  formatDateTime,
  formatDecimal,
  formatOdds,
  formatPercent,
  formatPointsDelta,
  formatPrice,
  formatProbability,
  freshnessLabel,
  lineupLabel,
  message,
  messages,
  parseLocale,
  qualityMeter,
  reasonLabel,
  recommendationExplanation,
  recommendationLabel,
  recommendationTone,
  subscriptionStatusLabel,
  translate,
  translations,
  translator,
  type MessageKey,
} from "../src/index.js";

describe("customer presentation formatting", () => {
  it("formats canonical decimal strings at the presentation boundary", () => {
    expect(formatDecimal("1.666666666666", 2)).toBe("1.67");
    expect(formatDecimal(null)).toBe("—");
  });

  it("renders odds with a fixed two decimals so columns align", () => {
    expect(formatOdds("1.666666666666666666666666666667")).toBe("1.67");
    expect(formatOdds("2")).toBe("2.00");
    expect(formatOdds("2.1")).toBe("2.10");
    expect(formatOdds(null)).toBe("—");
  });

  it("formats signed edges and expected value as fractions of one", () => {
    expect(formatPercent("0.059459459459")).toBe("+5.9%");
    expect(formatPercent("-0.05")).toBe("-5.0%");
  });

  it("formats probabilities without a misleading sign", () => {
    expect(formatProbability("0.6")).toBe("60.0%");
    expect(formatProbability("0.540540540541")).toBe("54.1%");
    expect(formatProbability(null)).toBe("—");
  });

  it("renders a probability gap in percentage points, not percent", () => {
    // A probability edge is the difference of two probabilities, so its unit
    // is percentage points. Labelling it "%" invites the reader to treat it
    // as a return, which it is not.
    expect(formatPointsDelta("0.059459459459")).toBe("+5.9 pp");
    expect(formatPointsDelta("-0.05")).toBe("-5.0 pp");
    expect(formatPointsDelta(null)).toBe("—");
  });

  it("localizes the percentage-points unit", () => {
    // English writes "pp"; Greek financial copy writes «μον.». Leaving
    // "pp" on a Greek page is an untranslated string like any other.
    expect(formatPointsDelta("0.059459459459", "el")).toBe("+5,9 μον.");
  });

  it("scales a movement ratio exactly once", () => {
    // The canonical DTO stores price movement as a ratio. Scaling it twice
    // rendered -1,190.5%; not scaling it at all rendered -0.1%. Both have
    // shipped at some point, so both directions are pinned here.
    expect(formatPercent("-0.11904761904762")).toBe("-11.9%");
    expect(formatPercent("0.14285714285714")).toBe("+14.3%");
    expect(formatPercent("0.05263157894737")).toBe("+5.3%");
    expect(formatPercent("-0.04545454545455")).toBe("-4.5%");
  });

  it("clamps bar widths and never divides by zero", () => {
    expect(barPercent("0.05", 0.2)).toBe(25);
    expect(barPercent("-0.05", 0.2)).toBe(25);
    expect(barPercent("9", 0.2)).toBe(100);
    expect(barPercent(null, 0.2)).toBe(0);
    expect(barPercent("0.1", 0)).toBe(0);
  });

  it("classifies direction without arithmetic on domain values", () => {
    expect(directionOf("0.1")).toBe("up");
    expect(directionOf("-0.1")).toBe("down");
    expect(directionOf("0")).toBe("flat");
    expect(directionOf(null)).toBe("unknown");
  });

  it("formats ISO timestamps consistently in UTC", () => {
    expect(formatDateTime("2026-09-04T18:30:00.000Z")).toBe(
      "04 Sept 2026, 18:30",
    );
  });

  it("pads counters and formats prices", () => {
    expect(formatCount(3)).toBe("03");
    expect(formatCount(0)).toBe("00");
    expect(formatPrice(0)).toBe("€0");
    expect(formatPrice(19)).toBe("€19");
  });
});

describe("locale resolution", () => {
  it("narrows arbitrary input to a supported locale", () => {
    expect(parseLocale("el")).toBe("el");
    expect(parseLocale("en")).toBe("en");
    expect(parseLocale("fr")).toBe("en");
    expect(parseLocale(null)).toBe("en");
    expect(parseLocale(undefined)).toBe("en");
  });
});

describe("bilingual catalog", () => {
  it("exposes stable English message keys", () => {
    expect(message("navMatchIntelligence")).toBe("Match Intelligence");
    expect(message("syntheticData")).toBe("Synthetic data");
  });

  it("translates into Greek", () => {
    expect(translate("navToday", "el")).toBe("Σήμερα");
    expect(translate("navAccount", "el")).toBe("Λογαριασμός");
    expect(translate("signOut", "el")).toBe("Αποσύνδεση");
    expect(translate("homeCreateAccount", "el")).toBe("Δημιουργία λογαριασμού");
    expect(translate("authForgotPassword", "el")).toBe(
      "Ξέχασες τον κωδικό σου;",
    );
    expect(translate("radarMarketMovement", "el")).toBe("Κίνηση αποδόσεων");
  });

  it("keeps brand and product names untranslated in both locales", () => {
    for (const locale of LOCALES) {
      expect(translate("navEdge", locale)).toBe("EDGE");
      expect(translate("navRadar", locale)).toBe("RADAR");
      expect(translate("navMatchIntelligence", locale)).toBe(
        "Match Intelligence",
      );
      // The creator credit is a proper noun and must not shift by locale.
      expect(translate("footerCreatedBy", locale)).toBe("Created by");
    }
  });

  it("has a complete, non-empty Greek translation for every key", () => {
    const keys = Object.keys(messages) as MessageKey[];
    const missing = keys.filter((key) => !translations.el[key]?.trim());
    expect(missing).toEqual([]);
  });

  it("does not leave Greek strings identical to English prose", () => {
    // Brand names, product names and the creator credit are intentionally
    // shared; everything else must actually be translated.
    const shared = new Set<MessageKey>([
      "navEdge",
      "navRadar",
      "navMatchIntelligence",
      "productMatchIntelligence",
      "footerCreatedBy",
      "planFreeName",
      "planProName",
      "planEliteName",
      "authEmailLabel",
      "homeEdgeLabel",
      "homeRadarLabel",
      "homeMatchLabel",
      "homePreviewRadar",
    ]);
    const keys = Object.keys(messages) as MessageKey[];
    const untranslated = keys.filter(
      (key) => !shared.has(key) && translations.el[key] === messages[key],
    );
    expect(untranslated).toEqual([]);
  });

  it("keeps the Greek register conversational and football-native", () => {
    // Terminology the native-copy review rejected. These are not stylistic
    // nits: each one made the product read as machine-translated, and the
    // owner rejected the previous catalog for exactly this.
    const banned: readonly [string, string][] = [
      ["επικαιρότητ", "means 'current affairs', not data freshness"],
      ["τεκμαρτ", "academic; the product says 'πιθανότητα αγοράς'"],
      ["διακομιστ", "dated formalism for 'server'"],
      ["συνεδρί", "reads as a medical appointment, not a login session"],
      ["σύνθεση", "football Greek says 'ενδεκάδα' for the starting eleven"],
    ];
    const offenders = Object.entries(translations.el).flatMap(([key, value]) =>
      banned
        .filter(([term]) => value.includes(term))
        .map(([term, why]) => `${key}: "${term}" — ${why}`),
    );
    expect(offenders).toEqual([]);
  });

  it("never phrases a model state as betting advice in Greek", () => {
    // NO_BET is a state the model reports, never an instruction to the
    // customer; «Όχι στοίχημα» would read as the latter.
    expect(translate("recNoBet", "el")).toBe("Χωρίς πρόταση");
    expect(translate("recNoBet", "el")).not.toContain("στοίχημα");
  });

  it("uses the Greek question mark, never the Latin one", () => {
    const latinQuestions = Object.entries(translations.el)
      .filter(([, value]) => value.includes("?"))
      .map(([key]) => key);
    expect(latinQuestions).toEqual([]);
  });

  it("interpolates named values", () => {
    const t = translator("en");
    expect(t("todaySnapshot", { time: "10:00" })).toBe(
      "Snapshot as of 10:00 UTC",
    );
    expect(t("edgeTracked", { count: 7 })).toBe("7 tracked");
    // An unknown placeholder is left intact rather than rendered as
    // "undefined" in front of a customer.
    expect(t("todaySnapshot")).toBe("Snapshot as of {time} UTC");
  });
});

describe("domain enumeration labelling", () => {
  it("never leaks SCREAMING_SNAKE codes to the customer", () => {
    for (const locale of LOCALES) {
      for (const code of [
        "STRONG_EDGE",
        "WAIT",
        "WAIT_FOR_LINEUP",
        "NO_BET",
        "INSUFFICIENT_DATA",
        "EDGE_DISAPPEARED",
      ]) {
        expect(recommendationLabel(code, locale)).not.toContain("_");
        expect(recommendationExplanation(code, locale).length).toBeGreaterThan(
          20,
        );
      }
      for (const code of [
        "MISSING_LINEUP",
        "STALE_DATA",
        "MISSING_PRICE",
        "WAITING_FOR_CONFIRMATION",
        "LOW_MAPPING_CONFIDENCE",
        "EDGE_DISAPPEARED",
        "REPRICED",
        "INSUFFICIENT_COVERAGE",
      ]) {
        expect(reasonLabel(code, locale)).not.toContain("_");
      }
      for (const code of ["OFFICIAL", "EXPECTED", "MISSING", "CHANGED"]) {
        expect(lineupLabel(code, locale)).not.toMatch(/^[A-Z_]+$/);
      }
      for (const code of ["FRESH", "STALE"]) {
        expect(freshnessLabel(code, locale)).not.toMatch(/^[A-Z_]+$/);
      }
    }
  });

  it("degrades gracefully for an unknown domain code", () => {
    expect(recommendationLabel("SOME_NEW_STATE", "en")).toBe("Some new state");
  });

  it("distinguishes a closed opportunity from one that never existed", () => {
    expect(recommendationTone("EDGE_DISAPPEARED")).not.toBe(
      recommendationTone("NO_BET"),
    );
    expect(recommendationTone("STRONG_EDGE")).toBe("positive");
  });

  it("maps quality grades onto a monotonic meter", () => {
    expect(qualityMeter("A")).toBeGreaterThan(qualityMeter("C"));
    expect(qualityMeter("C")).toBeGreaterThan(qualityMeter("F"));
  });

  it("labels subscription status and entitlements in plain language", () => {
    expect(subscriptionStatusLabel(null, "en")).toBe("No paid subscription");
    expect(subscriptionStatusLabel("past_due", "en")).toBe("Payment overdue");
    expect(subscriptionStatusLabel("active", "el")).toBe("Ενεργή");
    expect(entitlementLabel("edge.full", "en")).toBe("Full EDGE table");
    expect(entitlementLabel("match.detail", "el")).toBe(
      "Σελίδες Match Intelligence",
    );
  });
});
