import { describe, expect, it } from "vitest";
import {
  fetchCurrentSeasonCoverage,
  fetchFixtureLineups,
  lineupRequestBudget,
  lineupWindow,
  normalizeFootballLineup,
  normalizeLeagueCoverage,
  parseLineupResponse,
  planLineupRequests,
  type ApiSportsClient,
  type LineupCandidate,
  type ProviderQuota,
} from "../src/index.js";

/* A trimmed `/fixtures/lineups` element, in the provider's real shape. */
function lineupElement(
  overrides: Partial<{
    teamId: number;
    teamName: string;
    formation: string;
    coach: string;
    starters: number;
    substitutes: number;
  }> = {},
) {
  const starters = overrides.starters ?? 11;
  const substitutes = overrides.substitutes ?? 7;
  return {
    team: { id: overrides.teamId ?? 33, name: overrides.teamName ?? "Man Utd" },
    coach: { id: 1234, name: overrides.coach ?? "R. Ten Hag" },
    formation: overrides.formation ?? "4-2-3-1",
    startXI: Array.from({ length: starters }, (_, index) => ({
      player: {
        id: 1000 + index,
        name: `Starter ${index + 1}`,
        number: index + 1,
        pos: index === 0 ? "G" : index < 5 ? "D" : index < 9 ? "M" : "F",
        grid: `${index + 1}:1`,
      },
    })),
    substitutes: Array.from({ length: substitutes }, (_, index) => ({
      player: {
        id: 2000 + index,
        name: `Sub ${index + 1}`,
        number: 20 + index,
        pos: "M",
        grid: null,
      },
    })),
  };
}

function stubClient(
  body: unknown,
  quota: ProviderQuota = { state: "HEALTHY", requestsRemaining: 80 },
): ApiSportsClient & { calls: { path: string; query: unknown }[] } {
  const calls: { path: string; query: unknown }[] = [];
  return {
    calls,
    async get(path, query) {
      calls.push({ path, query });
      return { status: 200, body: body as never, quota };
    },
  };
}

describe("lineup normalization", () => {
  it("reads the XI, the bench, the formation and the coach", () => {
    const lineup = normalizeFootballLineup(lineupElement(), "215662");
    expect(lineup).toMatchObject({
      providerFixtureId: "215662",
      providerTeamId: "33",
      teamName: "Man Utd",
      formation: "4-2-3-1",
      coachName: "R. Ten Hag",
      providerCoachId: "1234",
      starters: 11,
      substitutes: 7,
    });
    expect(lineup.players).toHaveLength(18);
  });

  it("keeps player identity, position and role rather than a boolean", () => {
    // A future model has to be able to say what actually changed between two
    // lineups, which a "lineup present" flag makes impossible.
    const lineup = normalizeFootballLineup(lineupElement(), "215662");
    const keeper = lineup.players[0]!;
    expect(keeper).toMatchObject({
      providerPlayerId: "1000",
      name: "Starter 1",
      shirtNumber: 1,
      position: "G",
      grid: "1:1",
      role: "STARTER",
    });
    expect(lineup.players.at(-1)).toMatchObject({
      role: "SUBSTITUTE",
      grid: null,
    });
  });

  it("drops a nameless entry instead of storing a placeholder", () => {
    // "UNKNOWN" would make two different absent players look like the same
    // one, which defeats the point of storing the lineup at all.
    const lineup = normalizeFootballLineup(
      {
        team: { id: 1, name: "Someone" },
        startXI: [
          { player: { id: 5, number: 5 } },
          { player: { name: "Real" } },
        ],
        substitutes: [],
      },
      "1",
    );
    expect(lineup.players.map((player) => player.name)).toEqual(["Real"]);
  });

  it("refuses an element with no team, which is a contract violation", () => {
    expect(() => normalizeFootballLineup({ formation: "4-4-2" }, "1")).toThrow(
      /INVALID_FOOTBALL_LINEUP/,
    );
  });

  it("tolerates a missing coach and formation", () => {
    const lineup = normalizeFootballLineup(
      { team: { id: 9, name: "Nine" }, startXI: [], substitutes: [] },
      "1",
    );
    expect(lineup.coachName).toBeNull();
    expect(lineup.formation).toBeNull();
    expect(lineup.providerCoachId).toBeNull();
  });
});

describe("lineup availability", () => {
  it("reports an empty response as not published yet, not as an error", () => {
    // This is the normal answer for most of a fixture's life. Treating it as
    // a failure is the conflation the whole module exists to prevent.
    expect(parseLineupResponse({ response: [] }, "1")).toMatchObject({
      availability: "LINEUP_NOT_PUBLISHED_YET",
      lineups: [],
      rejected: 0,
    });
  });

  it("reports both complete XIs as available", () => {
    const parsed = parseLineupResponse(
      {
        response: [
          lineupElement(),
          lineupElement({ teamId: 40, teamName: "Liverpool" }),
        ],
      },
      "1",
    );
    expect(parsed.availability).toBe("LINEUP_AVAILABLE");
    expect(parsed.lineups).toHaveLength(2);
  });

  it("refuses to call one team's XI a complete lineup", () => {
    // Half a match's lineup cannot support a decision that claims to know
    // the teams, and the provider does sometimes have one side first.
    expect(
      parseLineupResponse({ response: [lineupElement()] }, "1").availability,
    ).toBe("LINEUP_NOT_PUBLISHED_YET");
  });

  it("refuses an XI that is short of eleven starters", () => {
    const parsed = parseLineupResponse(
      {
        response: [
          lineupElement({ starters: 11 }),
          lineupElement({ teamId: 40, starters: 7 }),
        ],
      },
      "1",
    );
    expect(parsed.availability).toBe("LINEUP_NOT_PUBLISHED_YET");
  });

  it("counts a malformed element without discarding the good ones", () => {
    const parsed = parseLineupResponse(
      { response: [lineupElement(), { formation: "4-4-2" }] },
      "1",
    );
    expect(parsed.rejected).toBe(1);
    expect(parsed.lineups).toHaveLength(1);
  });

  it("fetches a fixture's lineups through the provider client", async () => {
    const client = stubClient({
      response: [lineupElement(), lineupElement({ teamId: 40 })],
    });
    const result = await fetchFixtureLineups(client, "215662");
    expect(client.calls).toEqual([
      { path: "/fixtures/lineups", query: { fixture: "215662" } },
    ]);
    expect(result.availability).toBe("LINEUP_AVAILABLE");
    expect(result.requests).toBe(1);
  });
});

describe("league coverage", () => {
  const element = {
    league: { id: 39, name: "Premier League", type: "League" },
    country: { name: "England", code: "GB" },
    seasons: [
      {
        year: 2026,
        current: true,
        coverage: {
          fixtures: {
            events: true,
            lineups: true,
            statistics_fixtures: true,
          },
          odds: true,
          predictions: true,
          injuries: true,
        },
      },
    ],
  };

  it("reads the lineup flag from inside the fixtures block", () => {
    /*
     * `coverage.fixtures.lineups` sits a level deeper than the others. Read
     * from the wrong level it is undefined, every league looks uncovered, and
     * lineup polling stops entirely — silently.
     */
    expect(normalizeLeagueCoverage(element)[0]).toMatchObject({
      providerLeagueId: "39",
      leagueName: "Premier League",
      countryCode: "GB",
      season: 2026,
      current: true,
      lineups: true,
      odds: true,
      predictions: true,
      injuries: true,
      statistics: true,
    });
  });

  it("reports lineups as false when the provider says so", () => {
    const uncovered = {
      ...element,
      seasons: [
        {
          year: 2026,
          current: true,
          coverage: { fixtures: { events: true, lineups: false }, odds: true },
        },
      ],
    };
    expect(normalizeLeagueCoverage(uncovered)[0]?.lineups).toBe(false);
  });

  it("treats an absent coverage block as uncovered rather than assuming", () => {
    const bare = { ...element, seasons: [{ year: 2026, current: true }] };
    expect(normalizeLeagueCoverage(bare)[0]).toMatchObject({
      lineups: false,
      odds: false,
    });
  });

  it("skips a league with no id and a season with no year", () => {
    expect(normalizeLeagueCoverage({ league: { name: "No id" } })).toEqual([]);
    expect(
      normalizeLeagueCoverage({ ...element, seasons: [{ current: true }] }),
    ).toEqual([]);
  });

  it("fetches every league's current season in one request", async () => {
    // One request rather than one per league: on a 100-request daily budget
    // the difference between 1 and 11 is the difference between having a
    // lineup budget and not.
    const client = stubClient({ response: [element] });
    const result = await fetchCurrentSeasonCoverage(client);
    expect(client.calls).toEqual([
      { path: "/leagues", query: { current: "true" } },
    ]);
    expect(result.requests).toBe(1);
    expect(result.coverage).toHaveLength(1);
  });
});

describe("lineup polling windows", () => {
  it("maps time to kickoff onto a window", () => {
    expect(lineupWindow(600)).toBe("OUTSIDE_WINDOW");
    expect(lineupWindow(121)).toBe("OUTSIDE_WINDOW");
    expect(lineupWindow(120)).toBe("OCCASIONAL");
    expect(lineupWindow(91)).toBe("OCCASIONAL");
    expect(lineupWindow(90)).toBe("POLLING");
    expect(lineupWindow(46)).toBe("POLLING");
    expect(lineupWindow(45)).toBe("PRIORITY");
    expect(lineupWindow(1)).toBe("PRIORITY");
    expect(lineupWindow(0)).toBe("KICKED_OFF");
    expect(lineupWindow(-20)).toBe("KICKED_OFF");
  });
});

describe("lineup request budget", () => {
  it("spends nothing when the quota is critical or exhausted", () => {
    // Lineups are the most deferrable provider call: the decision they unlock
    // stays refused without them anyway, so they must never starve odds.
    for (const state of ["CRITICAL", "EXHAUSTED"] as const)
      expect(lineupRequestBudget({ state, requestsRemaining: 5 })).toBe(0);
  });

  it("leaves half the remaining daily budget untouched", () => {
    expect(
      lineupRequestBudget({ state: "HEALTHY", requestsRemaining: 10 }),
    ).toBe(5);
    expect(
      lineupRequestBudget({ state: "HEALTHY", requestsRemaining: 100 }),
    ).toBe(8);
  });

  it("halves the ceiling while conserving", () => {
    expect(
      lineupRequestBudget({ state: "CONSERVE", requestsRemaining: 100 }),
    ).toBe(4);
  });

  it("falls back to the per-invocation ceiling when the provider reports no count", () => {
    expect(
      lineupRequestBudget({ state: "HEALTHY", requestsRemaining: null }),
    ).toBe(8);
  });
});

describe("lineup request planning", () => {
  const asOf = new Date("2026-09-07T12:00:00Z");
  const healthy: ProviderQuota = {
    state: "HEALTHY",
    requestsRemaining: 100,
  };
  const candidate = (
    overrides: Partial<LineupCandidate> & { minutes: number },
  ): LineupCandidate => ({
    eventId: overrides.eventId ?? `event-${overrides.minutes}`,
    providerFixtureId: overrides.providerFixtureId ?? "1",
    kickoffAt: new Date(
      asOf.getTime() + overrides.minutes * 60_000,
    ).toISOString(),
    lineupsCovered: overrides.lineupsCovered ?? true,
    lineupAvailable: overrides.lineupAvailable ?? false,
    lastCheckedAt: overrides.lastCheckedAt ?? null,
  });

  const decisionFor = (input: LineupCandidate) =>
    planLineupRequests([input], healthy, asOf).entries[0]?.decision;

  it("does not ask a day out", () => {
    expect(decisionFor(candidate({ minutes: 1440 }))).toBe(
      "SKIP_OUTSIDE_WINDOW",
    );
  });

  it("asks inside the window", () => {
    expect(decisionFor(candidate({ minutes: 60 }))).toBe("REQUEST");
    expect(decisionFor(candidate({ minutes: 100 }))).toBe("REQUEST");
  });

  it("never asks when the provider says the league has no lineups", () => {
    // Permanent, not temporary: no amount of waiting changes it, so the
    // request would be wasted forever.
    expect(decisionFor(candidate({ minutes: 30, lineupsCovered: false }))).toBe(
      "SKIP_NOT_COVERED",
    );
  });

  it("asks when coverage is unknown rather than assuming either way", () => {
    expect(decisionFor(candidate({ minutes: 30, lineupsCovered: null }))).toBe(
      "REQUEST",
    );
  });

  it("stops discovery once a lineup is stored", () => {
    expect(decisionFor(candidate({ minutes: 30, lineupAvailable: true }))).toBe(
      "SKIP_ALREADY_AVAILABLE",
    );
  });

  it("does not ask again within the window's recheck interval", () => {
    // Re-asking every minute inside the priority window spends twenty
    // requests to learn the same thing twenty times.
    expect(
      decisionFor(
        candidate({
          minutes: 30,
          lastCheckedAt: new Date(asOf.getTime() - 2 * 60_000).toISOString(),
        }),
      ),
    ).toBe("SKIP_RECENTLY_CHECKED");
    expect(
      decisionFor(
        candidate({
          minutes: 30,
          lastCheckedAt: new Date(asOf.getTime() - 20 * 60_000).toISOString(),
        }),
      ),
    ).toBe("REQUEST");
  });

  it("does not ask about a match that has started", () => {
    expect(decisionFor(candidate({ minutes: -5 }))).toBe("SKIP_KICKED_OFF");
  });

  it("orders by soonest kickoff and denies the overflow for quota", () => {
    const plan = planLineupRequests(
      [
        candidate({ eventId: "late", minutes: 110 }),
        candidate({ eventId: "soon", minutes: 20 }),
        candidate({ eventId: "middle", minutes: 60 }),
      ],
      { state: "HEALTHY", requestsRemaining: 4 },
      asOf,
      { maxRequests: 8 },
    );
    // Budget of 2 (half of 4), soonest first: the answer that expires first
    // is worth the most.
    expect(plan.budget).toBe(2);
    expect(plan.requests.map((entry) => entry.eventId)).toEqual([
      "soon",
      "middle",
    ]);
    expect(plan.skippedForQuota).toBe(1);
    expect(
      plan.entries.find((entry) => entry.eventId === "late")?.decision,
    ).toBe("SKIP_QUOTA");
  });

  it("plans nothing at all when the quota is exhausted", () => {
    const plan = planLineupRequests(
      [candidate({ minutes: 20 })],
      { state: "EXHAUSTED", requestsRemaining: 0 },
      asOf,
    );
    expect(plan.requests).toEqual([]);
    expect(plan.entries[0]?.decision).toBe("SKIP_QUOTA");
  });
});
