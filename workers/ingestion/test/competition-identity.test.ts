import { describe, expect, it } from "vitest";

import { competitionSlug, resolveLeague } from "../src/apisports-coverage.js";

/*
 * These pin a defect that reached production.
 *
 * A Brazilian Série A fixture — Vitória vs Grêmio — was stored with
 * `canonical_code = ITA_SERIE_A`, because the backfill matched competitions on
 * a slug of the league name and `slug("Serie A")` is "serie-a" in both
 * countries. It was visible in the customer universe and eligible for model
 * pricing. Nothing downstream could have caught it: every later stage treats
 * the canonical code as established fact.
 */
describe("competition identity is never a name alone", () => {
  it("collides on the name alone, and separates once the country is known", () => {
    /*
     * The defect in one assertion. Without a country the two leagues produce
     * the same code and merge into one competition row; with it they cannot.
     */
    expect(competitionSlug("Serie A")).toBe(competitionSlug("Serie A"));
    expect(competitionSlug("Serie A", "IT")).toBe("serie-a-it");
    expect(competitionSlug("Serie A", "BR")).toBe("serie-a-br");
    expect(competitionSlug("Serie A", "IT")).not.toBe(
      competitionSlug("Serie A", "BR"),
    );
  });

  it("keeps the bare slug when the country is genuinely unknown", () => {
    /*
     * Unresolved rather than colliding with a country-scoped row. Unresolved
     * is recoverable by a later id-keyed ingestion; mismapped is not.
     */
    expect(competitionSlug("UEFA Champions League", null)).toBe(
      "uefa-champions-league",
    );
    expect(competitionSlug("Serie A", "")).toBe("serie-a");
  });

  it("refuses to resolve a league whose country is unknown", () => {
    const coverage = {
      providerLeagueId: "71",
      leagueName: "Serie A",
      countryName: null,
      countryCode: null,
      season: 2026,
      current: true,
      lineups: true,
      odds: true,
      predictions: true,
      injuries: true,
      statistics: true,
    };

    expect(resolveLeague(coverage)).toBeNull();
  });

  it("resolves the same league name to different codes by country", () => {
    const base = {
      countryName: "Italy",
      season: 2026,
      current: true,
      lineups: true,
      odds: true,
      predictions: true,
      injuries: true,
      statistics: true,
    };

    const italy = resolveLeague({
      ...base,
      providerLeagueId: "135",
      leagueName: "Serie A",
      countryName: "Italy",
      countryCode: "IT",
    });
    const brazil = resolveLeague({
      ...base,
      providerLeagueId: "71",
      leagueName: "Serie A",
      countryName: "Brazil",
      countryCode: "BR",
    });

    expect(italy).toBe("ITA_SERIE_A");
    /*
     * Brazil is not in the reviewed policy, so the correct answer is "no
     * canonical code" — not "the Italian one". An unmapped competition stays
     * in the raw provider universe and out of customer intelligence.
     */
    expect(brazil).toBeNull();
    expect(brazil).not.toBe(italy);
  });
});
