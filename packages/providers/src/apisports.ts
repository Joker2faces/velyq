import {
  STARTING_ELEVEN,
  type EventLifecycleStatus,
  type LineupStatus as DomainLineupStatus,
} from "@velyq/domain";
import type { DecimalString } from "@velyq/decimal";

export type ApiSport = "football" | "basketball";
export type OddsObservationV3 = Readonly<{
  sport: "FOOTBALL" | "BASKETBALL";
  eventId: string;
  competitionId: string;
  bookmakerId: string;
  market: string;
  providerMarket: string;
  selection: string;
  /**
   * The market's line, where the market has one.
   *
   * Part of the market's identity, not a display detail: OVER 2.5 and
   * OVER 3.5 are two different markets, and a key that omits the line makes
   * them collide.
   */
  line?: string;
  decimalOdds: DecimalString;
  providerObservedAt: string;
  ingestedAt: string;
  provider: "API_SPORTS";
  sourceReference: string;
}>;
export function orderObservations(
  observations: readonly OddsObservationV3[],
): readonly OddsObservationV3[] {
  return [...observations].sort(
    (a, b) =>
      Date.parse(a.providerObservedAt) - Date.parse(b.providerObservedAt) ||
      a.sourceReference.localeCompare(b.sourceReference),
  );
}
export function deduplicateObservations(
  observations: readonly OddsObservationV3[],
): readonly OddsObservationV3[] {
  const seen = new Set<string>();
  return orderObservations(observations).filter((item) => {
    const key = [
      item.sport,
      item.eventId,
      item.bookmakerId,
      item.providerMarket,
      item.selection,
      /* Without the line, OVER 2.5 and OVER 3.5 from one bookmaker at one
         instant deduplicate into a single observation. */
      item.line ?? "",
      item.providerObservedAt,
      item.decimalOdds,
    ].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
export type ApiSportsResponse = Readonly<{
  get?: string;
  results?: number;
  paging?: { current?: number; total?: number };
  response?: readonly unknown[];
  errors?: unknown;
}>;
export type ProviderQuota = Readonly<{
  state: "HEALTHY" | "CONSERVE" | "CRITICAL" | "EXHAUSTED";
  requestsRemaining: number | null;
}>;
export type ApiSportsClient = Readonly<{
  get(
    path: string,
    query?: Readonly<Record<string, string | number>>,
  ): Promise<
    Readonly<{ status: number; body: ApiSportsResponse; quota: ProviderQuota }>
  >;
}>;
const origins: Record<ApiSport, string> = {
  football: "https://v3.football.api-sports.io",
  basketball: "https://v1.basketball.api-sports.io",
};
/**
 * Reads the provider's *daily* remaining-request count, not its per-minute
 * one.
 *
 * API-Sports exposes two independent rate limits on every response:
 * `x-ratelimit-remaining` is the per-minute burst limit (small — 10 on the
 * plan this key is on, resetting every ~60 seconds), while
 * `x-ratelimit-requests-remaining` is the actual daily budget the quota
 * policy below has to protect. Reading the per-minute header here meant
 * `requestsRemaining` never legitimately exceeded 10, so the `< 30`
 * (CONSERVE) threshold could never fire from a real value and the `< 10`
 * (CRITICAL) threshold fired on nearly every response regardless of how much
 * of the actual daily budget was left — the one number the 25% daily reserve
 * policy exists to protect was never being read.
 */
function quota(value: string | null): ProviderQuota {
  const remaining = value === null ? null : Number(value);
  return {
    requestsRemaining: Number.isFinite(remaining) ? remaining : null,
    state:
      remaining === null || !Number.isFinite(remaining)
        ? "HEALTHY"
        : remaining <= 0
          ? "EXHAUSTED"
          : remaining < 10
            ? "CRITICAL"
            : remaining < 30
              ? "CONSERVE"
              : "HEALTHY",
  };
}
export function createApiSportsClient(
  sport: ApiSport,
  options: Readonly<{
    apiKey?: string;
    fetch?: typeof fetch;
    timeoutMs?: number;
    retries?: number;
  }> = {},
): ApiSportsClient {
  const key = options.apiKey ?? process.env["APISPORTS_KEY"];
  const request = options.fetch ?? fetch;
  return {
    async get(path, query = {}) {
      if (!key) throw new Error("APISPORTS_KEY_UNAVAILABLE");
      const url = new URL(path, origins[sport]);
      Object.entries(query).forEach(([name, value]) =>
        url.searchParams.set(name, String(value)),
      );
      let last: unknown;
      for (let attempt = 0; attempt <= (options.retries ?? 2); attempt += 1) {
        const controller = new AbortController();
        const timer = setTimeout(
          () => controller.abort(),
          options.timeoutMs ?? 8_000,
        );
        try {
          const response = await request(url, {
            headers: { "x-apisports-key": key },
            signal: controller.signal,
          });
          const text = await response.text();
          let body: ApiSportsResponse;
          try {
            body = JSON.parse(text) as ApiSportsResponse;
          } catch {
            throw new Error("PROVIDER_INVALID_JSON");
          }
          if (response.status === 429 || response.status >= 500) {
            last = new Error(`PROVIDER_RETRYABLE_${response.status}`);
            if (attempt < (options.retries ?? 2)) continue;
          }
          return {
            status: response.status,
            body,
            quota: quota(
              response.headers.get("x-ratelimit-requests-remaining"),
            ),
          };
        } catch (error) {
          last = error;
          if (attempt >= (options.retries ?? 2)) throw error;
        } finally {
          clearTimeout(timer);
        }
      }
      throw last instanceof Error ? last : new Error("PROVIDER_REQUEST_FAILED");
    },
  };
}

export type NormalizedEvent = Readonly<{
  sport: "FOOTBALL" | "BASKETBALL";
  providerEventId: string;
  competition: string;
  /**
   * The provider's own league id.
   *
   * Carried because the league *name* is not an identity: "Premier League"
   * exists in a dozen countries, and a resolver that keyed on a slug of it
   * left every real competition unresolvable. This is the value
   * `resolveCompetitionIdentity` (`@velyq/domain`) matches on, together with
   * `provider`.
   */
  competitionProviderId: string | null;
  /** The provider's country name, and its ISO code where one is supplied. */
  competitionCountry: string | null;
  competitionCountryCode: string | null;
  /** The provider's season year, where supplied. */
  season: number | null;
  participants: readonly string[];
  scheduledAt: string;
  status: string;
  provider: "API_SPORTS";
  sourceReference: string;
}>;
export type NormalizedOdds = Readonly<{
  sport: "FOOTBALL" | "BASKETBALL";
  providerEventId: string;
  bookmaker: string;
  providerMarket: string;
  canonicalMarket: string | "UNMAPPED";
  selection: string;
  line?: string;
  decimalOdds: DecimalString;
  /**
   * When the PROVIDER says the market was observed, or null if it did not say.
   *
   * Null is the important case, and it used to be impossible. This field fell
   * back to our own fetch time (`item["update"] ?? ingestedAt`), so a price of
   * entirely unknown age was recorded as having been observed the instant we
   * asked -- the freshness policy then called it CURRENT and the decision
   * engine treated it as actionable. That is precisely the confusion the
   * product's freshness rule exists to prevent: freshness describes the
   * evidence, not the request.
   *
   * The policy already models an unknown age -- it has an UNAVAILABLE state
   * and treats a null instant as "never priced". It simply never saw one,
   * because the normalizer manufactured a timestamp.
   */
  providerObservedAt: string | null;
  ingestedAt: string;
  provider: "API_SPORTS";
  sourceReference: string;
}>;
function valueRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}
/**
 * A provider identifier, or null.
 *
 * Never "UNKNOWN". An identifier placeholder makes two different unidentified
 * things compare equal, which for a competition id means two leagues
 * resolving to the same canonical code.
 */
function optionalIdentifier(value: unknown): string | null {
  if (typeof value === "string" && value.trim() !== "") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}
export function normalizeFootballFixture(
  raw: unknown,
  sourceReference = "api-sports:football:fixtures",
): NormalizedEvent {
  const item = valueRecord(raw);
  const fixture = valueRecord(item["fixture"]);
  const league = valueRecord(item["league"]);
  const teams = valueRecord(item["teams"]);
  const home = valueRecord(teams["home"]);
  const away = valueRecord(teams["away"]);
  if (typeof fixture["id"] !== "number" || typeof fixture["date"] !== "string")
    throw new Error("INVALID_FOOTBALL_FIXTURE");
  return {
    sport: "FOOTBALL",
    providerEventId: String(fixture["id"]),
    competition: String(league["name"] ?? "UNKNOWN"),
    competitionProviderId: optionalIdentifier(league["id"]),
    competitionCountry: optionalIdentifier(league["country"]),
    competitionCountryCode: optionalIdentifier(league["code"]),
    season: typeof league["season"] === "number" ? league["season"] : null,
    participants: [
      String(home["name"] ?? "UNKNOWN"),
      String(away["name"] ?? "UNKNOWN"),
    ],
    scheduledAt: fixture["date"],
    status: String(valueRecord(fixture["status"])["short"] ?? "UNKNOWN"),
    provider: "API_SPORTS",
    sourceReference,
  };
}
/**
 * A match result as the provider reports it.
 *
 * Deliberately narrower than `NormalizedEvent`: this carries the score and the
 * settlement-relevant lifecycle state, and nothing about the fixture's
 * identity beyond the provider id. Team names never take part -- the event is
 * resolved through `catalog.event_identities`, so a renamed club cannot
 * silently settle the wrong match.
 */
export type NormalizedResult = Readonly<{
  sport: "FOOTBALL";
  providerEventId: string;
  status: ResultLifecycleStatus;
  homeScore: number | null;
  awayScore: number | null;
  /** Unknown: the fixtures endpoint supplies kickoff, not a result update time. */
  providerObservedAt: string | null;
  receivedAt: string;
  provider: "API_SPORTS";
  sourceReference: string;
}>;

/**
 * The lifecycle states the application models.
 *
 * Re-exported from `@velyq/domain` rather than redeclared, so the provider
 * normalizer, the scheduler and the `intelligence.event_results` CHECK cannot
 * drift apart. A status outside this set is rejected here rather than at the
 * database, where the failure would surface as a constraint violation
 * mid-transaction.
 */
export type ResultLifecycleStatus = EventLifecycleStatus;

/**
 * API-Sports fixture status codes, mapped to the six states above.
 *
 * The three finished codes are all genuinely final: `FT` full time, `AET`
 * after extra time, `PEN` after penalties. They map to FINAL together, but
 * their aggregate `goals` include play outside regulation. Regulation-only
 * markets therefore read their explicit `score.fulltime` breakdown.
 *
 * `INT` (interrupted) maps to IN_PROGRESS rather than ABANDONED: an
 * interrupted match may resume, and treating it as abandoned would VOID
 * decisions that are still live. `SUSP` (suspended) is the same case. `AWD`
 * (technical award) and `WO` (walkover) are NOT mapped -- their scores are
 * administrative rather than played, and settling them silently would be a
 * product decision made by a lookup table.
 */
const RESULT_STATUS_BY_PROVIDER_CODE: Readonly<
  Record<string, ResultLifecycleStatus>
> = {
  TBD: "SCHEDULED",
  NS: "SCHEDULED",
  "1H": "IN_PROGRESS",
  HT: "IN_PROGRESS",
  "2H": "IN_PROGRESS",
  ET: "IN_PROGRESS",
  BT: "IN_PROGRESS",
  P: "IN_PROGRESS",
  LIVE: "IN_PROGRESS",
  INT: "IN_PROGRESS",
  SUSP: "IN_PROGRESS",
  FT: "FINAL",
  AET: "FINAL",
  PEN: "FINAL",
  PST: "POSTPONED",
  CANC: "CANCELLED",
  ABD: "ABANDONED",
};

/** Exposed so the ingestion layer can report an unmapped code as a reason. */
export function resultLifecycleStatus(
  providerCode: string,
): ResultLifecycleStatus | null {
  return (
    RESULT_STATUS_BY_PROVIDER_CODE[providerCode.trim().toUpperCase()] ?? null
  );
}

/** A goal count, or null. Never zero as a stand-in for "not reported". */
function optionalScore(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return null;
  }
  return value;
}

/**
 * Normalizes one `/fixtures` element into a result.
 *
 * Throws on a missing fixture id, because a result that cannot be attributed
 * to a fixture is not partially usable. An unmapped status also throws: the
 * alternative is to invent a lifecycle state for a code we have not
 * considered, and a wrong state settles or voids real decisions.
 *
 * A FINAL fixture with a missing score is returned as-is rather than
 * corrected. `settleDecision` already answers UNSETTLED for that case, and
 * inventing 0-0 would settle every decision on the match as a loss.
 */
export function normalizeFootballResult(
  raw: unknown,
  receivedAt: Date,
  sourceReference = "api-sports:football:results",
): NormalizedResult {
  if (!(receivedAt instanceof Date) || !Number.isFinite(receivedAt.getTime())) {
    throw new Error("RESULT_RECEIVED_AT_INVALID");
  }
  const item = valueRecord(raw);
  const fixture = valueRecord(item["fixture"]);
  const goals = valueRecord(item["goals"]);
  const fulltime = valueRecord(valueRecord(item["score"])["fulltime"]);
  if (typeof fixture["id"] !== "number") {
    throw new Error("INVALID_FOOTBALL_RESULT");
  }
  const providerCode = valueRecord(fixture["status"])["short"];
  if (typeof providerCode !== "string" || providerCode.trim() === "") {
    throw new Error("RESULT_STATUS_MISSING");
  }
  const status = resultLifecycleStatus(providerCode);
  if (status === null) {
    throw new Error(`RESULT_STATUS_UNMAPPED:${providerCode}`);
  }
  const providerCodeNormalized = providerCode.trim().toUpperCase();
  const regulationScore =
    providerCodeNormalized === "AET" || providerCodeNormalized === "PEN"
      ? fulltime
      : goals;
  /* `fixture.timestamp` and `fixture.date` describe kickoff. This endpoint
     supplies no genuine result-update timestamp; receipt is measured by the
     caller after acquiring the response, independently of the fixture. */
  return {
    sport: "FOOTBALL",
    providerEventId: String(fixture["id"]),
    status,
    homeScore: optionalScore(regulationScore["home"]),
    awayScore: optionalScore(regulationScore["away"]),
    providerObservedAt: null,
    receivedAt: receivedAt.toISOString(),
    provider: "API_SPORTS",
    sourceReference,
  };
}

/**
 * One team's lineup as the provider reports it.
 *
 * Deliberately without a confidence number. API-Sports does not say how
 * likely a lineup is to be the one that starts -- it either publishes the
 * confirmed sheet or it does not -- so inventing a confidence would be
 * inventing evidence. The distinction the product acts on is the status, and
 * a status is something the provider actually tells us.
 */
export type NormalizedLineup = Readonly<{
  sport: "FOOTBALL";
  providerEventId: string;
  /** The provider's own team id. Never a display name -- see the identity rules. */
  providerTeamId: string;
  teamName: string;
  status: LineupStatus;
  formation: string | null;
  players: readonly NormalizedLineupPlayer[];
  substitutes: readonly NormalizedLineupPlayer[];
  providerObservedAt: string;
  provider: "API_SPORTS";
  sourceReference: string;
}>;

export type NormalizedLineupPlayer = Readonly<{
  providerPlayerId: string | null;
  name: string;
  shirtNumber: number | null;
  position: string | null;
}>;

/**
 * The three states `intelligence.lineup_observations` accepts.
 *
 * Re-exported from `@velyq/domain` rather than redeclared, so the normalizer,
 * the scheduler and the database CHECK cannot drift apart.
 */
export type LineupStatus = DomainLineupStatus;

function lineupPlayers(value: unknown): readonly NormalizedLineupPlayer[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const player = valueRecord(valueRecord(entry)["player"]);
    const name = player["name"];
    /* A nameless entry is not a player. Keeping it would put an empty row in
       a lineup a customer reads. */
    if (typeof name !== "string" || name.trim() === "") return [];
    const number = player["number"];
    const position = player["pos"];
    return [
      {
        providerPlayerId: optionalIdentifier(player["id"]),
        name,
        shirtNumber:
          typeof number === "number" && Number.isInteger(number)
            ? number
            : null,
        position:
          typeof position === "string" && position !== "" ? position : null,
      },
    ];
  });
}

/**
 * Normalizes one `/fixtures/lineups` element.
 *
 * The status is derived from whether a starting eleven is actually present,
 * not from any field the provider sets: API-Sports publishes the lineup array
 * only once the sheet is confirmed, and returns an empty response before
 * that. So a full eleven is OFFICIAL, a partial list is EXPECTED, and nothing
 * at all is UNAVAILABLE.
 *
 * That mapping is conservative in the direction that matters. `WAIT_FOR_LINEUP`
 * must not clear on a provisional sheet, so anything short of a complete
 * eleven stays EXPECTED and keeps the gate closed.
 */
export function normalizeFootballLineup(
  raw: unknown,
  providerEventId: string,
  observedAt: string,
  sourceReference = "api-sports:football:lineups",
): NormalizedLineup {
  const item = valueRecord(raw);
  const team = valueRecord(item["team"]);
  const providerTeamId = optionalIdentifier(team["id"]);
  if (providerTeamId === null) {
    throw new Error("INVALID_FOOTBALL_LINEUP");
  }
  const players = lineupPlayers(item["startXI"]);
  const formation = item["formation"];
  return {
    sport: "FOOTBALL",
    providerEventId,
    providerTeamId,
    teamName: String(team["name"] ?? "UNKNOWN"),
    status:
      players.length >= STARTING_ELEVEN
        ? "OFFICIAL"
        : players.length > 0
          ? "EXPECTED"
          : "UNAVAILABLE",
    formation:
      typeof formation === "string" && formation.trim() !== ""
        ? formation
        : null,
    players,
    substitutes: lineupPlayers(item["substitutes"]),
    providerObservedAt: observedAt,
    provider: "API_SPORTS",
    sourceReference,
  };
}

/** Re-exported from `@velyq/domain`, where the product rule lives. */
export { STARTING_ELEVEN };

export function normalizeBasketballGame(
  raw: unknown,
  sourceReference = "api-sports:basketball:games",
): NormalizedEvent {
  const item = valueRecord(raw);
  const game = valueRecord(item["game"] ?? raw);
  const teams = valueRecord(item["teams"]);
  const home = valueRecord(teams["home"]);
  const away = valueRecord(teams["away"]);
  if (game["id"] === undefined || typeof game["date"] !== "string")
    throw new Error("INVALID_BASKETBALL_GAME");
  return {
    sport: "BASKETBALL",
    providerEventId: String(game["id"]),
    competition: String(valueRecord(item["league"])["name"] ?? "UNKNOWN"),
    competitionProviderId: optionalIdentifier(
      valueRecord(item["league"])["id"],
    ),
    competitionCountry: optionalIdentifier(
      valueRecord(valueRecord(item["country"]))["name"] ??
        valueRecord(item["league"])["country"],
    ),
    competitionCountryCode: optionalIdentifier(
      valueRecord(valueRecord(item["country"]))["code"],
    ),
    season:
      typeof valueRecord(item["league"])["season"] === "number"
        ? (valueRecord(item["league"])["season"] as number)
        : null,
    participants: [
      String(home["name"] ?? "UNKNOWN"),
      String(away["name"] ?? "UNKNOWN"),
    ],
    scheduledAt: game["date"],
    status: String(valueRecord(game["status"])["short"] ?? "UNKNOWN"),
    provider: "API_SPORTS",
    sourceReference,
  };
}
const footballMarkets: Record<string, string> = {
  "1": "MATCH_WINNER_1X2",
  "5": "TOTAL_GOALS",
  "8": "BTTS",
};

/**
 * Provider-neutral market codes whose selection carries its own line.
 *
 * API-Sports expresses a goals total not with the `handicap` field but inside
 * the selection string -- `"Over 2.5"`, `"Under 3.5"`. Left as-is, the line
 * survives only as incidental text inside a selection nobody parses, so two
 * different lines from the same bookmaker at the same instant look like two
 * quotes on one market. The line has to be lifted out into its own field
 * before anything downstream can key on it.
 */
const LINE_BEARING_SELECTION_MARKETS: ReadonlySet<string> = new Set([
  "TOTAL_GOALS",
  "TEAM_TOTAL",
  "TOTAL_POINTS",
]);

/**
 * Splits `"Over 2.5"` into the selection `OVER` and the line `2.5`.
 *
 * Returns null when the value does not have that shape, so an unrecognised
 * selection stays verbatim and is refused downstream as unmapped rather than
 * being silently reinterpreted. The line is normalised to a plain decimal
 * string -- never a float -- because it becomes part of a database key and of
 * the observation's content hash.
 */
export function splitLineBearingSelection(
  value: string,
): Readonly<{ selection: string; line: string }> | null {
  const match = /^\s*(over|under)\s+(\d+(?:\.\d+)?)\s*$/i.exec(value);
  if (!match?.[1] || !match[2]) return null;
  return { selection: match[1].toUpperCase(), line: match[2] };
}
const basketballMarkets: Record<string, string> = {
  "2": "MONEYLINE",
  "3": "SPREAD",
  "4": "TOTAL_POINTS",
  "100": "TEAM_TOTAL",
  "101": "TEAM_TOTAL",
};
export function normalizeOdds(
  raw: unknown,
  sport: "FOOTBALL" | "BASKETBALL",
  ingestedAt: string,
  sourceReference = "api-sports:odds",
): readonly NormalizedOdds[] {
  const item = valueRecord(raw);
  const eventValue = item["fixture"] ?? item["game"] ?? item["event"];
  const eventId = String(
    typeof eventValue === "object" && eventValue !== null
      ? (valueRecord(eventValue)["id"] ?? "")
      : (eventValue ?? ""),
  );
  const bookmakers = Array.isArray(item["bookmakers"])
    ? item["bookmakers"]
    : [];
  const output: NormalizedOdds[] = [];
  for (const bookmakerRaw of bookmakers) {
    const bookmaker = valueRecord(bookmakerRaw);
    const bets = Array.isArray(bookmaker["bets"]) ? bookmaker["bets"] : [];
    for (const betRaw of bets) {
      const bet = valueRecord(betRaw);
      const providerMarket = String(bet["id"] ?? bet["name"] ?? "");
      const canonical =
        (sport === "FOOTBALL" ? footballMarkets : basketballMarkets)[
          providerMarket
        ] ?? "UNMAPPED";
      const values = Array.isArray(bet["values"]) ? bet["values"] : [];
      for (const valueRaw of values) {
        const value = valueRecord(valueRaw);
        const odds = String(value["odd"] ?? "");
        if (!/^\d+(?:\.\d+)?$/.test(odds) || Number(odds) <= 1) continue;
        const rawSelection = String(value["value"] ?? "UNKNOWN");
        const parsed = LINE_BEARING_SELECTION_MARKETS.has(canonical)
          ? splitLineBearingSelection(rawSelection)
          : null;
        output.push({
          sport,
          providerEventId: eventId,
          bookmaker: String(bookmaker["name"] ?? bookmaker["id"] ?? "UNKNOWN"),
          providerMarket,
          canonicalMarket: canonical,
          selection: parsed?.selection ?? rawSelection,
          /*
           * The selection's own line wins over `handicap` when both are
           * present: for a goals total the provider puts the real line in the
           * selection and leaves `handicap` empty, and preferring `handicap`
           * would drop the only line that was actually quoted.
           */
          ...(parsed
            ? { line: parsed.line }
            : value["handicap"] === undefined
              ? {}
              : { line: String(value["handicap"]) }),
          decimalOdds: odds as DecimalString,
          /*
           * The provider's own instant, or null. Never our fetch time: see
           * `NormalizedOdds.providerObservedAt`.
           */
          providerObservedAt:
            typeof item["update"] === "string" && item["update"].trim() !== ""
              ? item["update"]
              : null,
          ingestedAt,
          provider: "API_SPORTS",
          sourceReference,
        });
      }
    }
  }
  return output;
}
export type IngestionRunSummary = Readonly<{
  provider: "API_SPORTS";
  sport: "FOOTBALL" | "BASKETBALL";
  startedAt: string;
  finishedAt: string;
  requests: number;
  received: number;
  normalized: number;
  deduplicated: number;
  rejected: number;
  unmapped: number;
  quotaState: ProviderQuota["state"];
  status: "DRY_RUN" | "COMPLETE" | "FAILED";
}>;
export function sanitizeProviderError(error: unknown): string {
  return String(error instanceof Error ? error.message : error)
    .replaceAll(
      /(x-apisports-key|api[-_]?key|authorization)(?:\s*[=:]\s*)[^\s,;]+/gi,
      "$1=[REDACTED]",
    )
    .replaceAll(/x-apisports-key|api[-_]?key|authorization/gi, "[REDACTED]");
}
