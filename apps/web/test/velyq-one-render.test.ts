import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LIVE_DATA_LABEL, type CustomerMatchDto } from "@velyq/contracts";
import { customerTodaySnapshot } from "../app/customer-data";
import type { TodaySurfaceDto } from "../app/customer/today-surface";
import { TodayView } from "../app/today/today-view";

const AS_OF = "2026-09-20T12:00:00.000Z";
const base = customerTodaySnapshot().matches[0]!;

function selectedMatch(
  overrides: Record<string, unknown> = {},
): CustomerMatchDto {
  return {
    ...base,
    eventId: "velyq-one-fixture",
    homeTeam: "Athens Athletic",
    awayTeam: "Thessaloniki United",
    competition: "competition.gre_super_league",
    startsAt: "2026-09-20T18:00:00.000Z",
    syntheticLabel: LIVE_DATA_LABEL,
    recommendation: "STRONG_EDGE",
    freshness: "CURRENT",
    lineup: "OFFICIAL",
    modelProbability: "0.6",
    currentOdds: "1.85",
    impliedProbability: "0.540540540541",
    probabilityEdge: "0.059459459459",
    expectedValue: "0.11",
    priceValidity: {
      status: "ATTRACTIVE",
      policyVersion: "price-validity.v1",
      breakEvenOdds: "1.66666667",
      minimumAcceptableOdds: "1.7",
    },
    quality: {
      grade: "A",
      score: "1",
      policyVersion: "quality-policy.v1",
      reasonCodes: [],
    },
    ...overrides,
  } as unknown as CustomerMatchDto;
}

function today(
  matches: readonly CustomerMatchDto[],
  full = true,
): TodaySurfaceDto {
  return {
    syntheticLabel: LIVE_DATA_LABEL,
    asOf: AS_OF,
    matches,
    summary: {
      totalFixtures: matches.length,
      byRecommendation: {
        STRONG_EDGE: matches.filter(
          (match) => match.recommendation === "STRONG_EDGE",
        ).length,
        NO_BET: matches.filter((match) => match.recommendation === "NO_BET")
          .length,
        WAIT: 0,
        WAIT_FOR_LINEUP: 0,
        INSUFFICIENT_DATA: 0,
        EDGE_DISAPPEARED: 0,
      },
      lineupGated: 0,
    },
    withheld: full ? 0 : 4,
    surface: "today",
    full,
  };
}

function render(
  matches: readonly CustomerMatchDto[],
  locale: "en" | "el",
  full = true,
) {
  return renderToStaticMarkup(
    createElement(TodayView, { locale, data: today(matches, full) }),
  );
}

describe("VELYQ ONE presentation", () => {
  it("renders the selected fixture as an evidence passport in English", () => {
    const html = render([selectedMatch()], "en");

    expect(html).toContain("VELYQ ONE");
    expect(html).toContain("Today’s strongest verified selection");
    expect(html).toContain("Athens Athletic");
    expect(html).toContain("Thessaloniki United");
    expect(html).toContain("Current selection");
    expect(html).toContain("Minimum acceptable odds");
    expect(html).toContain("1.70");
    expect(html).toContain("Official lineup");
    expect(html).toContain("View match analysis");
    expect(html).not.toMatch(/best bet|guaranteed|winner/i);
  });

  it("uses natural Greek labels without exposing internal identifiers", () => {
    const html = render([selectedMatch()], "el");

    expect(html).toContain("Η ισχυρότερη επαληθευμένη επιλογή της ημέρας");
    expect(html).toContain("Τρέχουσα επιλογή");
    expect(html).toContain("Ελάχιστη αποδεκτή απόδοση");
    expect(html).toContain("Επίσημες ενδεκάδες");
    expect(html).toContain("Δες την ανάλυση αγώνα");
    expect(html).not.toContain("competition.gre_super_league");
  });

  it("states the entitlement scope when only a preview slate is visible", () => {
    const html = render([selectedMatch()], "en", false);

    expect(html).toContain("Strongest verified selection in your access");
  });

  it("keeps an honest VELYQ ONE empty state instead of substituting a weak pick", () => {
    const html = render([selectedMatch({ recommendation: "NO_BET" })], "en");

    expect(html).toContain("VELYQ ONE");
    expect(html).toContain("No selection right now");
    expect(html).toContain(
      "No available selection meets the evidence and price requirements right now.",
    );
    expect(html).not.toContain("View match analysis");
  });
});
