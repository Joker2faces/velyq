import { createHash, randomUUID } from "node:crypto";
import { writeFile, rm } from "node:fs/promises";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import {
  createApiSportsClient,
  normalizeBasketballGame,
  normalizeFootballFixture,
  normalizeOdds,
  deduplicateObservations,
  sanitizeProviderError,
} from "../../packages/providers/src/apisports.js";

const run = promisify(exec);
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
const commit = argv.includes("--commit");
const client = createApiSportsClient(sport, { retries: 1 });
const now = new Date().toISOString();
const id = (key: string) => {
  const hex = createHash("sha256").update(key).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};
const sql = (value: string) => `'${value.replaceAll("'", "''")}'`;
const uuid = (key: string) => sql(id(key));

function marketCode(value: string) {
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

async function main() {
  try {
    const fixturePath = sport === "football" ? "/fixtures" : "/games";
    const fixtureResponse = await client.get(fixturePath, { date });
    const records = [...(fixtureResponse.body.response ?? [])].slice(0, 2);
    const events = records.map((record) =>
      sport === "football"
        ? normalizeFootballFixture(record)
        : normalizeBasketballGame(record),
    );
    const oddsResponses = await Promise.all(
      events.map((event) =>
        client.get(
          "/odds",
          sport === "football"
            ? { fixture: event.providerEventId }
            : { game: event.providerEventId },
        ),
      ),
    );
    const odds = deduplicateObservations(
      oddsResponses
        .flatMap((response) => response.body.response ?? [])
        .flatMap((record) =>
          normalizeOdds(
            record,
            sport.toUpperCase() as "FOOTBALL" | "BASKETBALL",
            now,
          ),
        ),
    ).filter((observation) =>
      Boolean(
        marketCode(observation.providerMarket) &&
        outcomeCode(observation.selection),
      ),
    );
    const runId = id(`api-sports:${sport}:${date}`);
    const lines: string[] = [
      "begin;",
      `insert into operations.provider_sync_runs (id,provider_id,capability,status,replay_sequence,fixture_path,content_hash,provider_schema_version,normalization_version,mapping_version,policy_version_id,started_at) values (${uuid(runId)},'30000000-0000-4000-8000-000000000002','${sport.toUpperCase()}_FIXTURES_ODDS','RUNNING',${sql(`${sport}:${date}`)},${sql(`api-sports:${sport}:${date}`)},${sql(`sha256:${createHash("sha256").update(JSON.stringify({ events, odds })).digest("hex")}`)},'api-sports.v1','api-sports.v1','api-sports.v1','31000000-0000-4000-8000-000000000002',${sql(now)}) on conflict do nothing;`,
    ];
    for (const event of events) {
      const eventId = id(`event:${sport}:${event.providerEventId}`);
      const competitionId = id(`competition:${sport}:${event.competition}`);
      const homeId = id(`participant:${sport}:${event.participants[0]}`);
      const awayId = id(`participant:${sport}:${event.participants[1]}`);
      const sportId =
        sport === "football"
          ? "20000000-0000-4000-8000-000000000001"
          : "20000000-0000-4000-8000-000000000002";
      lines.push(
        `insert into catalog.competitions (id,sport_id,code,name_key) values (${uuid(competitionId)},${uuid(sportId)},${sql(event.competition.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-"))},${sql(event.competition)}) on conflict (sport_id,code) do update set name_key=excluded.name_key;`,
      );
      for (const [participantId, name] of [
        [homeId, event.participants[0]],
        [awayId, event.participants[1]],
      ] as const)
        lines.push(
          `insert into catalog.participants (id,sport_id,type,code,display_name) values (${uuid(participantId)},${uuid(sportId)},'TEAM',${sql(name.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-"))},${sql(name)}) on conflict (sport_id,type,code) do update set display_name=excluded.display_name;`,
        );
      lines.push(
        `insert into catalog.events (id,sport_id,competition_id,starts_at,status,synthetic) values (${uuid(eventId)},${uuid(sportId)},${uuid(competitionId)},${sql(event.scheduledAt)},${sql(event.status)},false) on conflict (id) do update set starts_at=excluded.starts_at,status=excluded.status,synthetic=false;`,
      );
      lines.push(
        `insert into catalog.event_participants (event_id,participant_id,role) values (${uuid(eventId)},${uuid(homeId)},'HOME'),(${uuid(eventId)},${uuid(awayId)},'AWAY') on conflict do nothing;`,
      );
    }
    for (const observation of odds) {
      const code = marketCode(observation.providerMarket);
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
    lines.push(
      `update operations.provider_sync_runs set status='COMPLETED',completed_at=${sql(new Date().toISOString())},received_count=${events.length + odds.length},accepted_count=${events.length + odds.filter((o) => Boolean(marketCode(o.providerMarket) && outcomeCode(o.selection))).length},rejected_count=${odds.length} - ${odds.filter((o) => Boolean(marketCode(o.providerMarket) && outcomeCode(o.selection))).length} where id=${uuid(runId)}; commit;`,
    );
    if (commit) {
      const file = `.codex-apisports-${sport}-${Date.now()}.sql`;
      await writeFile(file, lines.join("\n"), "utf8");
      try {
        await run(
          `pnpm exec supabase db query --linked --project-ref zvdqkmevjfwprexshpap --file ${file}`,
        );
      } catch (error) {
        const detail = error as { stderr?: string; stdout?: string };
        throw new Error(
          sanitizeProviderError(
            detail.stderr?.trim() || detail.stdout?.trim() || error,
          ),
        );
      } finally {
        await rm(file, { force: true });
      }
    }
    console.log(
      JSON.stringify({
        provider: "API_SPORTS",
        sport: sport.toUpperCase(),
        date,
        events: events.length,
        normalizedOdds: odds.length,
        persisted: commit,
        status: commit ? "COMPLETE" : "DRY_RUN",
      }),
    );
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

void main();
