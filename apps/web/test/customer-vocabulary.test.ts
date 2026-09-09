import { describe, expect, it } from "vitest";
import {
  competitionLabel,
  marketLabel,
  recommendationLabel,
  selectionLabel,
} from "@velyq/ui";

/**
 * No customer surface may print a domain identifier.
 *
 * History rendered `{item.market} · {item.selection} · {item.decisionState}`
 * straight from the API, which serves `marketDefinition.labelKey`,
 * `decision.selection` and `decision.status` -- so a customer read
 * "market.football_full_time_1x2 · HOME · WAIT_FOR_LINEUP". The competition
 * came through the same way: `catalog.competitions.name_key` is a key by
 * design, and it was rendered verbatim on Today, on the match page, on the
 * landing page and in History.
 */
describe("customer vocabulary", () => {
  /** The shape of anything internal: a dotted key or a SCREAMING_SNAKE enum. */
  const internal = /^[a-z][a-z0-9]*(\.[a-z0-9_]+)+$|^[A-Z0-9_]{2,}$/;

  it.each(["en", "el"] as const)(
    "never returns an identifier for a market in %s",
    (locale) => {
      for (const code of [
        "market.football_full_time_1x2",
        "market.football_full_time_total",
        "market.something_never_wired",
      ]) {
        expect(marketLabel(code, locale)).not.toMatch(internal);
      }
    },
  );

  it.each(["en", "el"] as const)(
    "never returns an identifier for a selection or decision in %s",
    (locale) => {
      for (const code of ["HOME", "DRAW", "AWAY", "outcome.home"]) {
        expect(selectionLabel(code, locale)).not.toMatch(internal);
      }
      for (const code of [
        "STRONG_EDGE",
        "WAIT",
        "WAIT_FOR_LINEUP",
        "NO_BET",
        "INSUFFICIENT_DATA",
        "EDGE_DISAPPEARED",
      ]) {
        expect(recommendationLabel(code, locale)).not.toMatch(internal);
      }
    },
  );

  it("turns a competition key into words and leaves a real name alone", () => {
    expect(competitionLabel("competition.ita_serie_a")).toBe("Ita Serie A");
    expect(competitionLabel("competition.synthetic_league")).toBe(
      "Synthetic League",
    );
    /* Already a display name: it must survive untouched. */
    expect(competitionLabel("Premier Synthetic League")).toBe(
      "Premier Synthetic League",
    );
    expect(competitionLabel("Serie A")).toBe("Serie A");
  });

  it("never returns an identifier for any competition value", () => {
    for (const value of [
      "competition.ita_serie_a",
      "competition.bra_serie_a",
      "competition.nld_eredivisie",
      "competition.synthetic_league",
      "Serie A",
    ]) {
      expect(competitionLabel(value)).not.toMatch(internal);
    }
  });

  /*
   * Italy Serie A and Brazil Serie A are different competitions, and the
   * country prefix is the only thing distinguishing their keys. A label that
   * collapsed them would be worse than the raw key.
   */
  it("keeps two competitions with the same league name distinct", () => {
    expect(competitionLabel("competition.ita_serie_a")).not.toBe(
      competitionLabel("competition.bra_serie_a"),
    );
  });
});
