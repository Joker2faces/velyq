import { createHash } from "node:crypto";
import { createPrivilegedDatabaseClient } from "../../packages/database/src/client.js";
import {
  createApiSportsClient,
  normalizeBasketballGame,
  normalizeFootballFixture,
  normalizeOdds,
  sanitizeProviderError,
  type ApiSportsClient,
  type ProviderQuota,
} from "../../packages/providers/src/apisports.js";

const id = (key: string) => {
  const hex = createHash("sha256").update(key).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};
const sql = (value: string) => `'${value.replaceAll("'", "''")}'`;
/* The base form of the shared competition code rule; the country suffix is
   applied at the call site so an unknown country keeps the bare slug. */
const competitionSlug = (name: string) =>
  name
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
const uuid = (key: string) => sql(id(key));

/**
 * The `provider_sync_runs` identity for one invocation.
 *
 * Includes the invocation's own timestamp so that two polls for the same
 * sport and date never collide — see the note beside its call site for the
 * bug this fixes. Exported so run-identity uniqueness can be asserted
 * directly rather than only inferred from database side effects this module
 * otherwise keeps internal.
 */
export function runIdentity(
  sport: "football" | "basketball",
  date: string,
  nowIso: string,
) {
  return id(`api-sports:${sport}:${date}:${nowIso}`);
}

function marketCode(sport: "football" | "basketball", value: string) {
  if (sport === "football")
    return (
      {
        "1": "FOOTBALL_FULL_TIME_1X2",
        "5": "FOOTBALL_FULL_TIME_TOTAL",
        "8": "FOOTBALL_FULL_TIME_BTTS",
      } as Record<string, string>
    )[value];
  return (
    {
      "2": "BASKETBALL_FULL_GAME_MONEYLINE",
      "3": "BASKETBALL_FULL_GAME_SPREAD",
      "4": "BASKETBALL_FULL_GAME_TOTAL",
    } as Record<string, string>
  )[value];
}
function outcomeCode(value: string) {
  const normalized = value.toLowerCase();
  if (["home", "1"].includes(normalized)) return "HOME";
  if (["away", "2"].includes(normalized)) return "AWAY";
  if (normalized === "draw" || normalized === "x") return "DRAW";
  if (["over", "yes"].includes(normalized))
    return normalized === "over" ? "OVER" : "YES";
  if (["under", "no"].includes(normalized))
    return normalized === "under" ? "UNDER" : "NO";
  return undefined;
}
function lineFor(code: string, line: string | undefined) {
  return code.endsWith("1X2") ||
    code.endsWith("BTTS") ||
    code.endsWith("MONEYLINE")
    ? null
    : (line ?? null);
}

type NormalizedEvent = ReturnType<typeof normalizeFootballFixture>;

/**
 * Fetches every fixture/game the provider has for the date, not a sample.
 *
 * Production previously hard-capped this at the first two records returned
 * (`slice(0, 2)`), which is why the catalog held two football events and two
 * basketball events for the whole day regardless of how many the provider
 * actually reported. There is no cap here: every page the provider returns is
 * collected before this function returns, bounded only by the provider
 * actually running out of pages or quota.
 *
 * Pagination is handled defensively via `body.paging`, which the client type
 * already anticipates, even though a single date-scoped fixture list is not
 * known to paginate in practice for this provider — a response that never
 * sets `paging.total` above 1 simply exits the loop on the first page.
 */
export async function discoverAllEvents(
  client: ApiSportsClient,
  sport: "football" | "basketball",
  date: string,
): Promise<{
  records: readonly unknown[];
  quota: ProviderQuota;
  pagesFetched: number;
}> {
  const fixturePath = sport === "football" ? "/fixtures" : "/games";
  const records: unknown[] = [];
  let page = 1;
  let totalPages: number;
  let quota: ProviderQuota;
  do {
    /*
     * `page` is omitted entirely on the first request. Live-verified against
     * the real API: this date-scoped endpoint does not accept a `page`
     * parameter at all — sending `page=1` on a request that would otherwise
     * return every fixture for the date instead makes the provider reject
     * the whole request (`errors: { page: "The Page field do not exist." }`)
     * and return zero results, which silently looked like an empty sports
     * day rather than a malformed request. `page` is added only once a
     * response has actually reported more than one page exists — which this
     * endpoint has never been observed to do for a single date, so the loop
     * below runs exactly once in practice, and the pagination path stays
     * ready without ever sending a parameter the endpoint does not expect.
     */
    const response = await client.get(
      fixturePath,
      page === 1 ? { date } : { date, page },
    );
    quota = response.quota;
    const errors = response.body.errors;
    if (
      errors !== null &&
      typeof errors === "object" &&
      Object.keys(errors).length > 0
    ) {
      throw new Error(`PROVIDER_DISCOVERY_REJECTED:${JSON.stringify(errors)}`);
    }
    records.push(...(response.body.response ?? []));
    totalPages = Math.max(1, response.body.paging?.total ?? 1);
    page += 1;
  } while (page <= totalPages && quota.state !== "EXHAUSTED");
  return { records, quota, pagesFetched: Math.min(page - 1, totalPages) };
}

/**
 * Orders discovered events by how urgently RADAR needs a fresh price for
 * them: soonest kickoff first, on either side of "now". An event that has
 * already started still needs its closing price observed, so recency of
 * kickoff — not "is this still upcoming" — is what drives the order.
 */
export function prioritizeEventsForOddsCollection(
  events: readonly NormalizedEvent[],
  now: Date,
): readonly NormalizedEvent[] {
  const reference = now.getTime();
  return [...events].sort((a, b) => {
    const da = Math.abs(Date.parse(a.scheduledAt) - reference);
    const db = Math.abs(Date.parse(b.scheduledAt) - reference);
    return da - db || a.providerEventId.localeCompare(b.providerEventId);
  });
}

/**
 * How many `/odds` requests this invocation may spend.
 *
 * The provider quota is finite and shared across every scheduled poll for
 * the day, so one invocation must never spend it all: `reserveFraction` (25%
 * by default, per the standing policy) is left untouched whenever the
 * provider reports a numeric remaining count. `maxOddsRequests` is a second,
 * independent ceiling — a per-invocation budget — so a single poll cannot
 * exhaust the day's quota even when the provider is not reporting a
 * remaining count at all (`requestsRemaining: null`).
 *
 * A `CRITICAL` or `EXHAUSTED` quota state stops odds collection entirely for
 * this invocation; discovery has already happened by the time this is
 * called, so the day's catalog is still complete even when no odds request
 * is made at all.
 */
export function oddsRequestBudget(
  discoveredCount: number,
  quota: ProviderQuota,
  maxOddsRequests: number,
  reserveFraction: number,
): number {
  if (quota.state === "EXHAUSTED" || quota.state === "CRITICAL") return 0;
  const reserved =
    quota.requestsRemaining === null
      ? maxOddsRequests
      : Math.floor(quota.requestsRemaining * (1 - reserveFraction));
  // CONSERVE halves the per-invocation ceiling on top of the reserve, so a
  // quota that is merely getting low is drawn down more slowly than one that
  // is comfortably healthy.
  const stateCeiling =
    quota.state === "CONSERVE"
      ? Math.ceil(maxOddsRequests / 2)
      : maxOddsRequests;
  return Math.max(0, Math.min(discoveredCount, stateCeiling, reserved));
}

export type ApiSportsIngestionOptions = {
  sport: "football" | "basketball";
  date: string;
  commit: boolean;
  /** Injectable for tests; defaults to a real client reading APISPORTS_KEY. */
  client?: ApiSportsClient;
  now?: Date;
  /** Per-invocation ceiling on `/odds` requests. Keeps one poll from being
      able to exhaust the day's quota even when the provider reports no
      remaining count at all. */
  maxOddsRequests?: number;
  /** Fraction of the provider's remaining daily quota this invocation must
      leave untouched. */
  reserveFraction?: number;
};

export async function runApiSportsIngestion(
  options: ApiSportsIngestionOptions,
) {
  const {
    sport,
    date,
    commit,
    maxOddsRequests = 40,
    reserveFraction = 0.25,
  } = options;
  const client = options.client ?? createApiSportsClient(sport, { retries: 1 });
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();

  /*
   * Discovery and odds collection are two separate provider concerns with
   * two separate cost profiles: one fixture-list call covers the whole
   * day's catalog, while odds cost one request per event. Discovery is
   * therefore never bounded by quota — the catalog must be complete — and
   * only the odds phase below is.
   */
  const discovery = await discoverAllEvents(client, sport, date);
  const events = discovery.records.map((record) =>
    sport === "football"
      ? normalizeFootballFixture(record)
      : normalizeBasketballGame(record),
  );

  const prioritized = prioritizeEventsForOddsCollection(events, now);
  const oddsBudget = oddsRequestBudget(
    prioritized.length,
    discovery.quota,
    maxOddsRequests,
    reserveFraction,
  );
  const eventsForOdds = prioritized.slice(0, oddsBudget);
  const eventsSkippedForQuota = prioritized.length - eventsForOdds.length;

  let oddsQuota = discovery.quota;
  const oddsResponses = await Promise.all(
    eventsForOdds.map(async (event) => {
      const response = await client.get(
        "/odds",
        sport === "football"
          ? { fixture: event.providerEventId }
          : { game: event.providerEventId },
      );
      oddsQuota = response.quota;
      return response;
    }),
  );
  const seenOdds = new Set<string>();
  const odds = oddsResponses
    .flatMap((response) => response.body.response ?? [])
    .flatMap((record) =>
      normalizeOdds(
        record,
        sport.toUpperCase() as "FOOTBALL" | "BASKETBALL",
        nowIso,
      ),
    )
    .filter((observation) => {
      const key = `${observation.providerEventId}|${observation.bookmaker}|${observation.providerMarket}|${observation.selection}|${observation.line ?? "-"}|${observation.providerObservedAt}|${observation.decimalOdds}`;
      if (seenOdds.has(key)) return false;
      seenOdds.add(key);
      return true;
    })
    .filter((observation) =>
      Boolean(
        marketCode(sport, observation.providerMarket) &&
        outcomeCode(observation.selection),
      ),
    );

  /*
   * Run identity now includes the invocation's own timestamp, not just
   * sport and date. It used to be `sport:date` alone, so every poll for the
   * same sport on the same day resolved to the identical run id — the
   * insert's `on conflict do nothing` silently discarded every run after the
   * first, and the closing `update` kept re-targeting that same original
   * row. A day with four scheduled polls showed exactly one operational
   * run, not four.
   *
   * Observation identity is untouched: `source_observation_id` is still
   * derived purely from provider/market/selection/line/observed-at/price
   * (see `sourceId` below), so replaying the same unchanged price within the
   * same run — or across two different runs — still resolves to the same
   * row rather than duplicating it. Poll-run identity and observation
   * idempotency are two different keys on purpose.
   */
  const runId = runIdentity(sport, date, nowIso);
  const contentHash = `sha256:${createHash("sha256").update(JSON.stringify({ events, odds })).digest("hex")}`;
  const lines: string[] = [
    "begin;",
    `insert into operations.provider_sync_runs (id,provider_id,capability,status,replay_sequence,fixture_path,content_hash,provider_schema_version,normalization_version,mapping_version,policy_version_id,started_at) values (${uuid(runId)},'30000000-0000-4000-8000-000000000002','${sport.toUpperCase()}_FIXTURES_ODDS','RUNNING',${sql(`${sport}:${date}:${nowIso}`)},${sql(`api-sports:${sport}:${date}`)},${sql(contentHash)},'api-sports.v1','api-sports.v1','api-sports.v1','31000000-0000-4000-8000-000000000002',${sql(nowIso)}) on conflict do nothing;`,
  ];
  for (const event of events) {
    const eventId = id(`event:${sport}:${event.providerEventId}`);
    /*
     * The provider's league id is the competition's identity. A name is not
     * one: keyed by name alone, Brazil's Serie A and Italy's Serie A became a
     * single row — and that row carried a canonical code, so a Brazilian
     * fixture became eligible for pricing as Italian Serie A.
     *
     * The code keeps the human-readable slug with the discriminator appended,
     * so an operator reading the table can still tell what a row is. When the
     * provider supplies no league id there is nothing safe to key on, and the
     * bare slug is used: such a row stays unresolvable rather than colliding
     * with a properly identified one.
     */
    const leagueKey =
      event.competitionProviderId ??
      (event.competitionCountry === null
        ? null
        : competitionSlug(event.competitionCountry));
    const competitionCode = leagueKey
      ? `${competitionSlug(event.competition)}-${competitionSlug(leagueKey)}`
      : competitionSlug(event.competition);
    const competitionId = id(
      `competition:${sport}:${leagueKey ?? "unidentified"}:${event.competition}`,
    );
    const homeName = event.participants[0] ?? "UNKNOWN_HOME";
    const awayName = event.participants[1] ?? "UNKNOWN_AWAY";
    const homeId = id(`participant:${sport}:${homeName}`);
    const awayId = id(`participant:${sport}:${awayName}`);
    const sportId =
      sport === "football"
        ? "20000000-0000-4000-8000-000000000001"
        : "20000000-0000-4000-8000-000000000002";
    lines.push(
      /*
       * The country travels with the competition. Without it a league name is
       * not an identity — "Serie A" slugs identically for Italy and Brazil —
       * and the canonical-code resolver has nothing to disambiguate on.
       */
      `insert into catalog.competitions (id,sport_id,code,name_key,country_code) values (${uuid(competitionId)},${sql(sportId)},${sql(competitionCode)},${sql(event.competition)},${event.competitionCountryCode ? sql(event.competitionCountryCode.slice(0, 2)) : "null"}) on conflict (sport_id,code) do update set name_key=excluded.name_key,country_code=coalesce(excluded.country_code,catalog.competitions.country_code);`,
    );
    /*
     * The canonical code is resolved from the reviewed identity table by the
     * provider's league id — never inferred here. A league nobody has mapped
     * stays null, which keeps it in the raw provider universe and out of
     * customer intelligence, and a mapped one resolves without any name
     * comparison at all.
     */
    if (event.competitionProviderId)
      lines.push(
        `update catalog.competitions c set canonical_code = ci.canonical_code from catalog.competition_identities ci where c.id = ${uuid(competitionId)} and ci.source_code = 'API_SPORTS' and ci.source_key = ${sql(event.competitionProviderId)} and c.canonical_code is distinct from ci.canonical_code;`,
      );
    for (const [participantId, name] of [
      [homeId, homeName],
      [awayId, awayName],
    ] as const)
      lines.push(
        `insert into catalog.participants (id,sport_id,type,code,display_name) values (${uuid(participantId)},${sql(sportId)},'TEAM',${sql(name.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-"))},${sql(name)}) on conflict (sport_id,type,code) do update set display_name=excluded.display_name;`,
      );
    // Persisted unconditionally, whether or not this event was inside the
    // odds budget above: the catalog must represent the full sports day, and
    // an event awaiting its odds request is still real, schedulable evidence
    // rather than something to hide until priced.
    lines.push(
      `insert into catalog.events (id,sport_id,competition_id,starts_at,status,synthetic) values (${uuid(eventId)},${sql(sportId)},${uuid(competitionId)},${sql(event.scheduledAt)},${sql(event.status)},false) on conflict (id) do update set starts_at=excluded.starts_at,status=excluded.status,synthetic=false;`,
    );
    /*
     * The reverse mapping. The event's UUID is derived by hashing the
     * provider's fixture id, which resolves one way only; without this row
     * nothing can later ask the provider about a fixture already stored —
     * its lineup, its result — without re-discovering it and spending quota
     * to learn something already known.
     */
    lines.push(
      `insert into catalog.event_identities (event_id,source_code,source_key) values (${uuid(eventId)},'API_SPORTS',${sql(event.providerEventId)}) on conflict (source_code,source_key) do nothing;`,
    );
    lines.push(
      `insert into catalog.event_participants (event_id,participant_id,role) values (${uuid(eventId)},${uuid(homeId)},'HOME'),(${uuid(eventId)},${uuid(awayId)},'AWAY') on conflict do nothing;`,
    );
  }
  for (const observation of odds) {
    const code = marketCode(sport, observation.providerMarket);
    const outcome = code ? outcomeCode(observation.selection) : undefined;
    if (!code || !outcome) continue;
    const eventId = id(`event:${sport}:${observation.providerEventId}`);
    const marketId = id(
      `market:${eventId}:${code}:${lineFor(code, observation.line) ?? "-"}`,
    );
    const outcomeId = id(`outcome:${marketId}:${outcome}`);
    const bookmakerId = id(`bookmaker:${observation.bookmaker}`);
    const sourceId = id(
      `source:${observation.sourceReference}:${observation.providerEventId}:${observation.providerMarket}:${observation.selection}:${observation.providerObservedAt}:${observation.decimalOdds}`,
    );
    lines.push(
      `insert into market.bookmakers (id,code,display_name,synthetic) values (${uuid(bookmakerId)},${sql(observation.bookmaker.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-"))},${sql(observation.bookmaker)},false) on conflict (code) do update set display_name=excluded.display_name,synthetic=false;`,
    );
    lines.push(
      `insert into market.event_markets (id,event_id,market_definition_id,line_value,canonical_key) select ${uuid(marketId)},${uuid(eventId)},id,${lineFor(code, observation.line) ? sql(lineFor(code, observation.line)!) : "null"},${sql(`api-sports|${eventId}|${code}|${lineFor(code, observation.line) ?? "-"}`)} from market.market_definitions where code=${sql(code)} on conflict (id) do nothing;`,
    );
    lines.push(
      `insert into market.event_market_outcomes (id,event_market_id,market_definition_id,outcome_definition_id,canonical_key) select ${uuid(outcomeId)},${uuid(marketId)},m.market_definition_id,o.id,${sql(`api-sports|${eventId}|${code}|${lineFor(code, observation.line) ?? "-"}|${outcome}`)} from market.event_markets m join market.outcome_definitions o on o.market_definition_id=m.market_definition_id where m.id=${uuid(marketId)} and o.code=${sql(outcome)} on conflict (id) do nothing;`,
    );
    lines.push(
      `insert into operations.source_observations (id,provider_id,sync_run_id,observation_type,provider_external_id,provider_observed_at,received_at,normalized_at,normalization_version,mapping_version,content_hash) values (${uuid(sourceId)},'30000000-0000-4000-8000-000000000002',${uuid(runId)},'ODDS',${sql(observation.providerEventId)},${sql(observation.providerObservedAt)},${sql(observation.ingestedAt)},${sql(observation.ingestedAt)},'api-sports.v1','api-sports.v1',${sql(`sha256:${createHash("sha256").update(JSON.stringify(observation)).digest("hex")}`)}) on conflict do nothing;`,
    );
    lines.push(
      `insert into market.odds_observations (source_observation_id,event_market_outcome_id,bookmaker_id,decimal_odds,provider_observed_at,received_at,normalized_at,status,is_synthetic) select ${uuid(sourceId)},${uuid(outcomeId)},${uuid(bookmakerId)},${sql(observation.decimalOdds)},${sql(observation.providerObservedAt)},${sql(observation.ingestedAt)},${sql(observation.ingestedAt)},'ACTIVE',false where not exists (select 1 from market.odds_observations where source_observation_id=${uuid(sourceId)} and event_market_outcome_id=${uuid(outcomeId)} and bookmaker_id=${uuid(bookmakerId)});`,
    );
  }
  const acceptedOdds = odds.filter((o) =>
    Boolean(marketCode(sport, o.providerMarket) && outcomeCode(o.selection)),
  ).length;
  lines.push(
    `update operations.provider_sync_runs set status='COMPLETED',completed_at=${sql(new Date().toISOString())},received_count=${events.length + odds.length},accepted_count=${events.length + acceptedOdds},rejected_count=${odds.length - acceptedOdds} where id=${uuid(runId)}; commit;`,
  );
  if (commit) {
    const connectionString = process.env["VELYQ_DATABASE_URL"];
    if (!connectionString) throw new Error("VELYQ_DATABASE_URL_UNAVAILABLE");
    const dbClient = createPrivilegedDatabaseClient({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 1,
    });
    const connection = await dbClient.pool.connect();
    try {
      await connection.query("begin");
      for (const statement of lines.slice(1, -1)) {
        await connection.query(statement);
      }
      await connection.query(lines.at(-1)!.replace(/\s*commit;\s*$/i, ""));
      await connection.query("commit");
    } catch (error) {
      await connection.query("rollback");
      throw error;
    } finally {
      connection.release();
      await dbClient.close();
    }
  }
  return {
    provider: "API_SPORTS" as const,
    sport: sport.toUpperCase() as "FOOTBALL" | "BASKETBALL",
    date,
    // Backward-compatible fields: existing callers (the admin-triggered
    // ingest route, its tests) read these two.
    events: events.length,
    normalizedOdds: odds.length,
    persisted: commit,
    status: commit ? ("COMPLETE" as const) : ("DRY_RUN" as const),
    // New fields: real coverage and quota accounting, so this is no longer a
    // black box between "ran" and "failed".
    eventsDiscovered: events.length,
    pagesFetched: discovery.pagesFetched,
    oddsRequestsUsed: eventsForOdds.length,
    oddsRequestsSkippedForQuota: eventsSkippedForQuota,
    quotaState: oddsQuota.state,
    requestsRemaining: oddsQuota.requestsRemaining,
  };
}

async function main() {
  const argv = process.argv.filter((value) => value !== "--");
  const args = new Map<string, string>();
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key?.startsWith("--") && value && !value.startsWith("--"))
      args.set(key.slice(2), value);
  }
  const sport = args.get("sport") === "basketball" ? "basketball" : "football";
  const date = args.get("date") ?? new Date().toISOString().slice(0, 10);
  try {
    const result = await runApiSportsIngestion({
      sport,
      date,
      commit: argv.includes("--commit"),
    });
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(
      JSON.stringify({
        provider: "API_SPORTS",
        sport: sport.toUpperCase(),
        status: "FAILED",
        error: sanitizeProviderError(error),
      }),
    );
    process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith("apisports-ingest.ts")) void main();
