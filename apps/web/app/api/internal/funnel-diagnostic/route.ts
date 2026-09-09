import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { utcDayWindow } from "@velyq/database";

import { checkForecastCycleAuth } from "../../../forecast-cycle/auth";
import { openRuntimeDatabaseSession } from "../../../runtime-database/runtime-database";

/**
 * Answers the one operational question the customer surfaces cannot: why is
 * Today empty?
 *
 * "Today shows nothing" has several possible causes that look identical from
 * outside -- no fixtures ingested at all, fixtures ingested for a different
 * day, fixtures present but unmapped, mapped but priceless, priced but with
 * yesterday's market. Reading the customer API cannot distinguish them, and
 * answering it by hand needs production SQL, which is precisely what the
 * owner should not have to run. So every stage of the funnel is counted here
 * against the same UTC day window `getToday` uses, and reported side by
 * side: the first stage that collapses to zero is the cause, and everything
 * below it is a consequence rather than a second fault.
 *
 * Deliberately a single round trip. This runs on a Worker with a small CPU
 * allowance, and every stage is a cheap aggregate, so paying one query for
 * the whole funnel keeps the diagnostic from becoming an operational risk of
 * its own.
 *
 * Counts and timestamps only -- no club names, no prices, no account data. A
 * diagnostic that leaked the product's data would be a worse problem than
 * the emptiness it explains.
 */

/*
 * Reference horizon used only to separate "nothing exists" from "nothing
 * exists *today*". Not a product window: `getToday` remains a strict UTC
 * calendar day, and this must not quietly become a second definition of it.
 */
const HORIZON_HOURS = 48;

/*
 * The pipeline has no implemented odds-staleness policy at all:
 * `DatabaseFreshestOddsReader` accepts any observation at or before `asOf`,
 * however old. This threshold is therefore this diagnostic's own reporting
 * boundary, not a policy the pipeline enforces -- it exists so "priced with
 * yesterday's market" is visible instead of being counted as a fresh price.
 */
const REPORTING_FRESHNESS_MINUTES = 180;

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = checkForecastCycleAuth(request.headers);
  if (!auth.ok) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: auth.reason === "SECRET_NOT_CONFIGURED" ? 503 : 401 },
    );
  }

  const now = new Date();
  const { start, end } = utcDayWindow(now);
  const horizonEnd = new Date(now.getTime() + HORIZON_HOURS * 3_600_000);
  const freshnessCutoff = new Date(
    now.getTime() - REPORTING_FRESHNESS_MINUTES * 60_000,
  );

  const session = await openRuntimeDatabaseSession({
    connectionTimeoutMillis: 5_000,
  });
  if (!session) {
    return NextResponse.json(
      { error: "Database unavailable" },
      { status: 503 },
    );
  }

  try {
    const result = await session.database.execute(sql`
      with day_events as (
        select e.id, e.synthetic, e.competition_id
        from catalog.events e
        join catalog.sports s on s.id = e.sport_id
        where s.code = 'FOOTBALL'
          and e.starts_at >= ${start.toISOString()}
          and e.starts_at < ${end.toISOString()}
      ),
      horizon_events as (
        select e.id
        from catalog.events e
        join catalog.sports s on s.id = e.sport_id
        where s.code = 'FOOTBALL'
          and e.starts_at >= ${now.toISOString()}
          and e.starts_at < ${horizonEnd.toISOString()}
      ),
      day_outcomes as (
        select o.id as outcome_id, m.event_id
        from market.event_markets m
        join market.event_market_outcomes o on o.event_market_id = m.id
        where m.event_id in (select id from day_events)
      ),
      day_odds as (
        select d.event_id,
               max(oo.provider_observed_at) as latest_observed_at,
               count(*) as observation_count
        from day_outcomes d
        join market.odds_observations oo
          on oo.event_market_outcome_id = d.outcome_id
        group by d.event_id
      )
      select
        (select count(*) from catalog.events) as events_all_time,
        (select count(*) from catalog.events where synthetic = true) as events_synthetic_all_time,
        (select min(starts_at) from catalog.events) as earliest_event_starts_at,
        (select max(starts_at) from catalog.events) as latest_event_starts_at,
        (select count(*) from catalog.event_identities) as event_identities_all_time,
        (select count(*) from catalog.competition_identities) as competition_identities_all_time,
        (select count(*) from catalog.competition_identities where mapping_status = 'CONFIRMED') as competition_identities_confirmed,
        (select count(*) from catalog.competitions) as competitions_all_time,
        (select count(*) from operations.providers) as providers_registered,
        (select count(*) from operations.provider_sync_runs) as provider_sync_runs_all_time,
        (select max(created_at) from operations.provider_sync_runs) as last_provider_sync_run_at,
        (select count(*) from market.odds_observations) as odds_observations_all_time,
        (select max(provider_observed_at) from market.odds_observations) as latest_odds_observed_at,
        (select count(*) from intelligence.predictions) as predictions_all_time,
        (select count(*) from intelligence.prediction_runs) as prediction_runs_all_time,
        (select max(created_at) from intelligence.prediction_runs) as last_prediction_run_at,
        (select count(*) from intelligence.decisions) as decisions_all_time,
        (select count(*) from intelligence.market_settlements) as market_settlements_all_time,
        (select count(*) from intelligence.lineup_observations) as lineup_observations_all_time,
        (select count(*) from horizon_events) as fixtures_in_horizon,
        (select count(*) from day_events) as fixtures_today,
        (select count(*) from day_events where synthetic = false) as fixtures_today_live,
        (select count(*) from day_events where synthetic = true) as fixtures_today_synthetic,
        (select count(distinct competition_id) from day_events) as competitions_today,
        (select count(*) from day_events d where exists (select 1 from catalog.event_identities i where i.event_id = d.id)) as fixtures_today_with_identity,
        (select count(distinct event_id) from day_outcomes) as fixtures_today_with_markets,
        (select count(*) from day_odds) as fixtures_today_with_odds,
        (select count(*) from day_odds where latest_observed_at >= ${freshnessCutoff.toISOString()}) as fixtures_today_fresh_odds,
        (select count(*) from day_odds where observation_count >= 2) as fixtures_today_radar_capable,
        (select count(*) from day_events d where exists (select 1 from intelligence.lineup_observations l where l.event_id = d.id)) as fixtures_today_with_lineup,
        (select count(*) from intelligence.predictions p
           join market.event_market_outcomes o on o.id = p.event_market_outcome_id
           join market.event_markets m on m.id = o.event_market_id
           where m.event_id in (select id from day_events)) as predictions_today
    `);

    /*
     * The driver returns either an array of rows or a `{ rows }` envelope
     * depending on how the session was opened; normalise rather than assume,
     * so a shape change degrades to a null funnel instead of a crash.
     */
    const rows = Array.isArray(result)
      ? result
      : ((result as { rows?: readonly unknown[] }).rows ?? []);

    return NextResponse.json(
      {
        now: now.toISOString(),
        todayWindow: { start: start.toISOString(), end: end.toISOString() },
        horizon: { hours: HORIZON_HOURS, end: horizonEnd.toISOString() },
        reportingFreshnessMinutes: REPORTING_FRESHNESS_MINUTES,
        databaseSource: session.source,
        funnel: (rows[0] as Record<string, unknown> | undefined) ?? null,
      },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    /*
     * A diagnostic must not become a second mystery, so the reason is
     * reported -- the message only, never a stack and never a connection
     * string.
     */
    return NextResponse.json(
      {
        error: "Diagnostic failed",
        reason: error instanceof Error ? error.message : "UNKNOWN_ERROR",
      },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  } finally {
    await session.close().catch(() => {});
  }
}
