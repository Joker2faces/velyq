#!/usr/bin/env node
/**
 * Backfills `catalog.event_identities` for events ingested before the identity
 * table existed.
 *
 * The reconciliation is exact, not a name match. Ingestion derives an event's
 * UUID as `sha256("event:<sport>:<providerEventId>")` shaped into a v4-looking
 * identifier, so the provider's fixture id determines the row id completely.
 * This script recomputes that hash for every fixture the provider reports on a
 * date and writes an identity only where the resulting UUID already names a
 * stored event. A fixture VELYQ never ingested produces a UUID that matches
 * nothing and is skipped.
 *
 * That property is the whole point. Matching on team names and kickoff times
 * would attach the wrong provider id to a fixture the first time two clubs
 * shared a name or a kickoff moved, and a wrong identity is worse than a
 * missing one: every later lineup and result would be fetched for someone
 * else's match.
 *
 * Costs one provider request per date. Idempotent — re-running writes nothing.
 *
 * Usage:
 *   node tooling/scripts/backfill-event-identities.mjs --project-ref <ref> --date 2026-09-07 [--date 2026-09-08] [--apply]
 */
import { createHash } from "node:crypto";

const API = "https://api.supabase.com";
const FOOTBALL = "https://v3.football.api-sports.io";

/** Exactly the identifier ingestion derives. Any drift here writes garbage. */
function derivedEventId(sport, providerEventId) {
  const hex = createHash("sha256")
    .update(`event:${sport}:${providerEventId}`)
    .digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function literal(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  const value = process.argv[index + 1];
  return index === -1 || value === undefined || value.startsWith("--")
    ? null
    : value;
}

function allArguments(name) {
  const values = [];
  process.argv.forEach((token, index) => {
    if (token !== `--${name}`) return;
    const value = process.argv[index + 1];
    if (value !== undefined && !value.startsWith("--")) values.push(value);
  });
  return values;
}

async function query(projectRef, token, sql) {
  const response = await fetch(
    `${API}/v1/projects/${projectRef}/database/query`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    },
  );
  const text = await response.text();
  if (!response.ok)
    throw new Error(
      `SUPABASE_QUERY_FAILED ${response.status}: ${text.slice(0, 600)}`,
    );
  try {
    return JSON.parse(text);
  } catch {
    return [];
  }
}

async function fixturesForDate(apiKey, date) {
  const response = await fetch(`${FOOTBALL}/fixtures?date=${date}`, {
    headers: { "x-apisports-key": apiKey },
  });
  const remaining = response.headers.get("x-ratelimit-requests-remaining");
  if (!response.ok)
    throw new Error(`APISPORTS_FIXTURES_FAILED ${response.status}`);
  const body = await response.json();
  return {
    fixtures: (body.response ?? []).map((entry) => ({
      providerEventId: String(entry.fixture?.id),
      kickoff: entry.fixture?.date ?? null,
      league: entry.league?.name ?? null,
    })),
    remaining: remaining === null ? null : Number(remaining),
  };
}

async function main() {
  const token = process.env["SUPABASE_ACCESS_TOKEN"];
  if (!token) throw new Error("SUPABASE_ACCESS_TOKEN is required.");
  const apiKey = process.env["APISPORTS_KEY"];
  if (!apiKey) throw new Error("APISPORTS_KEY is required.");
  const projectRef =
    argument("project-ref") ?? process.env["SUPABASE_PROJECT_REF"];
  if (!projectRef) throw new Error("--project-ref is required.");
  const dates = allArguments("date");
  if (dates.length === 0) throw new Error("At least one --date is required.");
  const apply = process.argv.includes("--apply");

  const summary = {
    projectRef,
    mode: apply ? "APPLY" : "PLAN",
    dates,
    providerRequests: 0,
    fixturesSeen: 0,
    matchedExistingEvents: 0,
    written: 0,
    quotaRemaining: null,
  };

  const matches = [];
  for (const date of dates) {
    const { fixtures, remaining } = await fixturesForDate(apiKey, date);
    summary.providerRequests += 1;
    summary.quotaRemaining = remaining;
    summary.fixturesSeen += fixtures.length;

    /*
     * One query per date rather than one per fixture. A matchday can carry
     * several hundred fixtures and the point of this script is to cost one
     * provider request; spending three hundred database round trips to save
     * nothing would be a strange trade.
     */
    const derived = fixtures.map((fixture) => ({
      ...fixture,
      eventId: derivedEventId("football", fixture.providerEventId),
    }));
    if (derived.length === 0) continue;
    const existing = await query(
      projectRef,
      token,
      `select id::text as id from catalog.events where id in (${derived
        .map((entry) => `${literal(entry.eventId)}::uuid`)
        .join(",")})`,
    );
    const known = new Set(existing.map((row) => row.id));
    for (const entry of derived)
      if (known.has(entry.eventId)) matches.push(entry);
  }

  summary.matchedExistingEvents = matches.length;

  if (apply && matches.length > 0) {
    const values = matches
      .map(
        (entry) =>
          `(${literal(entry.eventId)}::uuid,'API_SPORTS',${literal(entry.providerEventId)})`,
      )
      .join(",");
    await query(
      projectRef,
      token,
      `insert into catalog.event_identities (event_id, source_code, source_key)
       values ${values}
       on conflict (source_code, source_key) do nothing;`,
    );
    const [count] = await query(
      projectRef,
      token,
      "select count(*)::int as total from catalog.event_identities where source_code = 'API_SPORTS'",
    );
    summary.written = count?.total ?? 0;
  }

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

await main();
