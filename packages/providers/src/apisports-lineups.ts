import type { ApiSportsClient, ProviderQuota } from "./apisports.js";

/**
 * API-Sports lineups and the league coverage flags that say whether asking is
 * even worth a request.
 *
 * Three states have to stay distinguishable, because they call for three
 * different product behaviours and collapsing them into one boolean is what
 * made a T-24h market look like broken data:
 *
 * - `LINEUP_NOT_COVERED` — the provider's own coverage flags say this
 *   league/season has no lineup data at all. Asking is a wasted request
 *   forever, not just now, and no amount of waiting will change it.
 * - `LINEUP_NOT_PUBLISHED_YET` — coverage says lineups exist, but this
 *   fixture's has not appeared. Normal a day out; a problem twenty minutes
 *   before kickoff.
 * - `LINEUP_AVAILABLE` — an actual XI is stored.
 *
 * The free plan allows 100 requests a day across every endpoint, so the
 * coverage check is what keeps lineup polling from eating the odds budget.
 */

export type LineupAvailability =
  "LINEUP_AVAILABLE" | "LINEUP_NOT_PUBLISHED_YET" | "LINEUP_NOT_COVERED";

export type PlayerRole = "STARTER" | "SUBSTITUTE";

export type NormalizedLineupPlayer = Readonly<{
  /** The provider's own player id, where it supplies one. */
  providerPlayerId: string | null;
  name: string;
  shirtNumber: number | null;
  /** The provider's position code: G, D, M, F. */
  position: string | null;
  /** The provider's pitch grid reference, e.g. "2:3". Null for substitutes. */
  grid: string | null;
  role: PlayerRole;
}>;

export type NormalizedLineup = Readonly<{
  providerFixtureId: string;
  providerTeamId: string | null;
  teamName: string;
  formation: string | null;
  coachName: string | null;
  providerCoachId: string | null;
  players: readonly NormalizedLineupPlayer[];
  starters: number;
  substitutes: number;
  provider: "API_SPORTS";
  sourceReference: string;
}>;

function valueRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function optionalText(value: unknown): string | null {
  if (typeof value === "string" && value.trim() !== "") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function optionalInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return null;
}

function players(
  raw: unknown,
  role: PlayerRole,
): readonly NormalizedLineupPlayer[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry): NormalizedLineupPlayer[] => {
    const player = valueRecord(valueRecord(entry)["player"]);
    const name = optionalText(player["name"]);
    /*
     * A nameless entry is dropped rather than stored as "UNKNOWN". The point
     * of persisting a lineup is being able to say later what actually
     * changed, and a placeholder name makes two different absent players look
     * like the same one.
     */
    if (name === null) return [];
    return [
      {
        providerPlayerId: optionalText(player["id"]),
        name,
        shirtNumber: optionalInteger(player["number"]),
        position: optionalText(player["pos"]),
        grid: optionalText(player["grid"]),
        role,
      },
    ];
  });
}

/**
 * One team's lineup from a `/fixtures/lineups` response element.
 *
 * Throws on a response element with no team, because that is a contract
 * violation rather than missing data: the endpoint returns one element per
 * team and an element without one cannot be attributed to anybody.
 */
export function normalizeFootballLineup(
  raw: unknown,
  providerFixtureId: string,
  sourceReference = "api-sports:football:fixtures/lineups",
): NormalizedLineup {
  const item = valueRecord(raw);
  const team = valueRecord(item["team"]);
  const teamName = optionalText(team["name"]);
  if (teamName === null) throw new Error("INVALID_FOOTBALL_LINEUP");
  const coach = valueRecord(item["coach"]);
  const startXI = players(item["startXI"], "STARTER");
  const substitutes = players(item["substitutes"], "SUBSTITUTE");
  return {
    providerFixtureId,
    providerTeamId: optionalText(team["id"]),
    teamName,
    formation: optionalText(item["formation"]),
    coachName: optionalText(coach["name"]),
    providerCoachId: optionalText(coach["id"]),
    players: [...startXI, ...substitutes],
    starters: startXI.length,
    substitutes: substitutes.length,
    provider: "API_SPORTS",
    sourceReference,
  };
}

export type ParsedLineupResponse = Readonly<{
  availability: "LINEUP_AVAILABLE" | "LINEUP_NOT_PUBLISHED_YET";
  lineups: readonly NormalizedLineup[];
  rejected: number;
}>;

/**
 * Reads a whole `/fixtures/lineups` response.
 *
 * An empty response is `LINEUP_NOT_PUBLISHED_YET`, not an error: that is the
 * normal answer for most of a fixture's life, and treating it as a failure is
 * exactly the conflation this module exists to prevent.
 *
 * A response with only one team is also NOT_PUBLISHED_YET. The provider
 * occasionally has one side's XI before the other, and half a match's lineup
 * cannot support a decision that claims to know the teams.
 */
export function parseLineupResponse(
  body: Readonly<{ response?: readonly unknown[] }>,
  providerFixtureId: string,
): ParsedLineupResponse {
  const elements = Array.isArray(body.response) ? body.response : [];
  const lineups: NormalizedLineup[] = [];
  let rejected = 0;
  for (const element of elements) {
    try {
      lineups.push(normalizeFootballLineup(element, providerFixtureId));
    } catch {
      rejected += 1;
    }
  }
  const complete =
    lineups.length >= 2 && lineups.every((lineup) => lineup.starters >= 11);
  return {
    availability: complete ? "LINEUP_AVAILABLE" : "LINEUP_NOT_PUBLISHED_YET",
    lineups,
    rejected,
  };
}

export type LeagueCoverage = Readonly<{
  providerLeagueId: string;
  leagueName: string;
  countryName: string | null;
  countryCode: string | null;
  season: number;
  current: boolean;
  /** The flags this pipeline actually acts on. */
  lineups: boolean;
  odds: boolean;
  predictions: boolean;
  injuries: boolean;
  statistics: boolean;
}>;

/**
 * League/season coverage from a `/leagues` response element.
 *
 * The lineup flag lives at `coverage.fixtures.lineups`, one level deeper than
 * the others, which is easy to read past — and reading it as `undefined`
 * would make every league look uncovered and stop lineup polling entirely.
 */
export function normalizeLeagueCoverage(
  raw: unknown,
): readonly LeagueCoverage[] {
  const item = valueRecord(raw);
  const league = valueRecord(item["league"]);
  const country = valueRecord(item["country"]);
  const providerLeagueId = optionalText(league["id"]);
  const leagueName = optionalText(league["name"]);
  if (providerLeagueId === null || leagueName === null) return [];
  const seasons = Array.isArray(item["seasons"]) ? item["seasons"] : [];
  return seasons.flatMap((seasonRaw): LeagueCoverage[] => {
    const season = valueRecord(seasonRaw);
    const year = optionalInteger(season["year"]);
    if (year === null) return [];
    const coverage = valueRecord(season["coverage"]);
    const fixtures = valueRecord(coverage["fixtures"]);
    return [
      {
        providerLeagueId,
        leagueName,
        countryName: optionalText(country["name"]),
        countryCode: optionalText(country["code"]),
        season: year,
        current: season["current"] === true,
        lineups: fixtures["lineups"] === true,
        odds: coverage["odds"] === true,
        predictions: coverage["predictions"] === true,
        injuries: coverage["injuries"] === true,
        statistics: fixtures["statistics_fixtures"] === true,
      },
    ];
  });
}

export type CoverageFetch = Readonly<{
  coverage: readonly LeagueCoverage[];
  quota: ProviderQuota;
  requests: number;
}>;

/**
 * Fetches coverage for the current season in one request.
 *
 * One request for every league, rather than one per league: the endpoint
 * accepts `current=true` and returns the whole set, and on a 100-request daily
 * budget the difference between one call and eleven is the difference between
 * having a lineup budget and not.
 */
export async function fetchCurrentSeasonCoverage(
  client: ApiSportsClient,
): Promise<CoverageFetch> {
  const response = await client.get("/leagues", { current: "true" });
  const body = response.body as { response?: readonly unknown[] };
  const coverage = (body.response ?? []).flatMap((element) =>
    normalizeLeagueCoverage(element),
  );
  return { coverage, quota: response.quota, requests: 1 };
}

export type LineupFetch = Readonly<{
  providerFixtureId: string;
  availability: "LINEUP_AVAILABLE" | "LINEUP_NOT_PUBLISHED_YET";
  lineups: readonly NormalizedLineup[];
  quota: ProviderQuota;
  requests: number;
}>;

export async function fetchFixtureLineups(
  client: ApiSportsClient,
  providerFixtureId: string,
): Promise<LineupFetch> {
  const response = await client.get("/fixtures/lineups", {
    fixture: providerFixtureId,
  });
  const parsed = parseLineupResponse(
    response.body as { response?: readonly unknown[] },
    providerFixtureId,
  );
  return {
    providerFixtureId,
    availability: parsed.availability,
    lineups: parsed.lineups,
    quota: response.quota,
    requests: 1,
  };
}
