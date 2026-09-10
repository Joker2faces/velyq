import { describe, expect, it } from "vitest";
import { STARTING_ELEVEN, normalizeFootballLineup } from "../src/apisports.js";

/**
 * The lineup status is the field the product acts on: `WAIT_FOR_LINEUP` clears
 * on OFFICIAL and stays shut otherwise. So the mapping from what the provider
 * sent to that status is a product rule, and every case below is a way of
 * clearing the gate on evidence that does not justify it.
 */

const OBSERVED_AT = "2026-09-20T17:00:00.000Z";

function player(index: number) {
  return {
    player: {
      id: 1000 + index,
      name: `Player ${index}`,
      number: index,
      pos: index === 1 ? "G" : "M",
      grid: "1:1",
    },
  };
}

function sheet(count: number) {
  return Array.from({ length: count }, (_, index) => player(index + 1));
}

function response(overrides: Record<string, unknown> = {}) {
  return {
    team: { id: 496, name: "Juventus" },
    formation: "4-3-3",
    startXI: sheet(STARTING_ELEVEN),
    substitutes: sheet(7),
    ...overrides,
  };
}

describe("normalizeFootballLineup", () => {
  it("reads a complete sheet as official", () => {
    const lineup = normalizeFootballLineup(response(), "1015243", OBSERVED_AT);
    expect(lineup).toMatchObject({
      sport: "FOOTBALL",
      providerEventId: "1015243",
      providerTeamId: "496",
      teamName: "Juventus",
      status: "OFFICIAL",
      formation: "4-3-3",
      provider: "API_SPORTS",
      providerObservedAt: OBSERVED_AT,
    });
    expect(lineup.players).toHaveLength(STARTING_ELEVEN);
    expect(lineup.substitutes).toHaveLength(7);
    expect(lineup.players[0]).toEqual({
      providerPlayerId: "1001",
      name: "Player 1",
      shirtNumber: 1,
      position: "G",
    });
  });

  /*
   * The conservative direction. A partial sheet is real information worth
   * storing, but it must not clear a gate that exists to wait for the
   * confirmed eleven.
   */
  it("treats a partial sheet as expected, not official", () => {
    const lineup = normalizeFootballLineup(
      response({ startXI: sheet(STARTING_ELEVEN - 1) }),
      "1015243",
      OBSERVED_AT,
    );
    expect(lineup.status).toBe("EXPECTED");
  });

  it("treats an absent sheet as unavailable", () => {
    for (const startXI of [[], null, undefined]) {
      const lineup = normalizeFootballLineup(
        response({ startXI }),
        "1015243",
        OBSERVED_AT,
      );
      expect(lineup.status).toBe("UNAVAILABLE");
      expect(lineup.players).toEqual([]);
    }
  });

  /*
   * A team the provider did not identify cannot be attached to a side of the
   * fixture, and guessing from the name is exactly what the identity rules
   * forbid.
   */
  it("refuses a lineup with no team identity", () => {
    expect(() =>
      normalizeFootballLineup(
        response({ team: { name: "Juventus" } }),
        "1015243",
        OBSERVED_AT,
      ),
    ).toThrow("INVALID_FOOTBALL_LINEUP");
  });

  /* A nameless entry is not a player; keeping it would put an empty row in a
     lineup a customer reads, and would also inflate the eleven count. */
  it("drops nameless entries rather than counting them", () => {
    const lineup = normalizeFootballLineup(
      response({
        startXI: [...sheet(STARTING_ELEVEN - 1), { player: { id: 9999 } }],
      }),
      "1015243",
      OBSERVED_AT,
    );
    expect(lineup.players).toHaveLength(STARTING_ELEVEN - 1);
    expect(lineup.status).toBe("EXPECTED");
  });

  it("keeps a missing shirt number or position null", () => {
    const lineup = normalizeFootballLineup(
      response({
        startXI: [{ player: { id: 1, name: "Nameless Number" } }],
      }),
      "1015243",
      OBSERVED_AT,
    );
    expect(lineup.players[0]).toEqual({
      providerPlayerId: "1",
      name: "Nameless Number",
      shirtNumber: null,
      position: null,
    });
  });

  it("keeps an absent formation null rather than inventing one", () => {
    for (const formation of ["", "   ", null, undefined]) {
      const lineup = normalizeFootballLineup(
        response({ formation }),
        "1015243",
        OBSERVED_AT,
      );
      expect(lineup.formation).toBeNull();
    }
  });

  /*
   * The observation instant is supplied by the caller, because the lineups
   * endpoint reports no timestamp of its own. That is honest -- our fetch time
   * is genuinely the earliest moment we know the sheet existed -- and it is
   * why lineup freshness is never presented as market freshness is.
   */
  it("carries the caller's observation instant", () => {
    const lineup = normalizeFootballLineup(
      response(),
      "1015243",
      "2026-09-20T17:45:00.000Z",
    );
    expect(lineup.providerObservedAt).toBe("2026-09-20T17:45:00.000Z");
  });

  it("does not invent a confidence value", () => {
    const lineup = normalizeFootballLineup(response(), "1015243", OBSERVED_AT);
    expect("confidence" in lineup).toBe(false);
  });
});
