import { sql } from "drizzle-orm";
import type { PrivilegedVelyqDatabase } from "../client.js";

/**
 * One coherent HOME/DRAW/AWAY forecast triple for a settled event market,
 * against the true outcome -- the raw material for true multi-class 1X2
 * calibration (admin) and, separately, the model-vs-market baseline
 * comparison (admin), both of which score the identical set of events.
 *
 * Coherence is the entire point of this query's shape: a prediction run can
 * be retriggered for the same event market (a lineup-triggered recompute,
 * most notably), so the same model version can have more than one forecast
 * row per outcome over time. Picking the single most recent completed,
 * pre-kickoff run per (event_market, model_version) -- via
 * `latest_run_per_market` below -- is what guarantees HOME/DRAW/AWAY here
 * always come from the same real forecast, never a triple assembled from
 * different prediction runs (which would neither reflect a real forecast
 * nor necessarily sum to 1), and never from features observed after kickoff.
 */
export type MultiClassCalibrationRow = Readonly<{
  modelVersion: string;
  eventMarketId: string;
  kickoff: Date;
  seasonLabel: string | null;
  competitionCode: string;
  trueOutcome: "HOME" | "DRAW" | "AWAY";
  probabilityHome: string;
  probabilityDraw: string;
  probabilityAway: string;
}>;

export async function queryMultiClassCalibrationRows(
  database: PrivilegedVelyqDatabase,
): Promise<readonly MultiClassCalibrationRow[]> {
  const result = await database.execute(sql`
    with sibling_forecasts as (
      select f.model_version, f.probability, od.code as outcome_code,
             em.id as event_market_id, em.event_id, p.prediction_run_id
      from intelligence.forecasts f
      join intelligence.predictions p on p.id = f.prediction_id
      join market.event_market_outcomes emo on emo.id = f.event_market_outcome_id
      join market.outcome_definitions od on od.id = emo.outcome_definition_id
      join market.event_markets em on em.id = emo.event_market_id
      join market.market_definitions md on md.id = em.market_definition_id
      where md.code = 'FOOTBALL_FULL_TIME_1X2'
    ),
    latest_run_per_market as (
      select distinct on (sf.event_market_id, sf.model_version)
        sf.event_market_id, sf.model_version, sf.prediction_run_id
      from sibling_forecasts sf
      join intelligence.prediction_runs pr on pr.id = sf.prediction_run_id
      join catalog.events e on e.id = sf.event_id
      where pr.status = 'COMPLETED'
        and pr.completed_at is not null
        and pr.feature_cutoff <= e.starts_at
        and pr.completed_at <= e.starts_at
      order by sf.event_market_id, sf.model_version,
        pr.completed_at desc, pr.started_at desc nulls last, pr.id desc
    ),
    coherent_forecasts as (
      select sf.*
      from sibling_forecasts sf
      join latest_run_per_market lr
        on lr.event_market_id = sf.event_market_id
       and lr.model_version = sf.model_version
       and lr.prediction_run_id = sf.prediction_run_id
    ),
    results as (
      -- Match History's correction authority: genuine provider update time
      -- when known, otherwise acquisition. Persistence order and UUID only
      -- break ties; a delayed older response must not replace a correction.
      select distinct on (er.event_id) er.event_id,
        case when er.home_score > er.away_score then 'HOME'
             when er.home_score < er.away_score then 'AWAY'
             else 'DRAW' end as true_outcome
      from intelligence.event_results er
      join operations.source_observations so on so.id = er.source_observation_id
      where er.status = 'FINAL' and er.home_score is not null and er.away_score is not null
      order by er.event_id, coalesce(er.provider_observed_at, so.received_at) desc,
        er.created_at desc, er.id desc
    )
    select
      sf.model_version,
      sf.event_market_id,
      e.starts_at as kickoff,
      e.season_label,
      c.code as competition_code,
      r.true_outcome,
      max(case when sf.outcome_code = 'HOME' then sf.probability end) as p_home,
      max(case when sf.outcome_code = 'DRAW' then sf.probability end) as p_draw,
      max(case when sf.outcome_code = 'AWAY' then sf.probability end) as p_away
    from coherent_forecasts sf
    join results r on r.event_id = sf.event_id
    join catalog.events e on e.id = sf.event_id
    join catalog.competitions c on c.id = e.competition_id
    group by sf.model_version, sf.event_market_id, e.starts_at, e.season_label, r.true_outcome, c.code
    having
      max(case when sf.outcome_code = 'HOME' then sf.probability end) is not null and
      max(case when sf.outcome_code = 'DRAW' then sf.probability end) is not null and
      max(case when sf.outcome_code = 'AWAY' then sf.probability end) is not null
  `);
  return result.rows.map((row) => ({
    modelVersion: String(row["model_version"]),
    eventMarketId: String(row["event_market_id"]),
    // `execute(sql)` exposes the driver's raw timestamp value. Normalize it
    // exactly once at this repository boundary; admin consumers keep this
    // Date and never stringify/reparse it before the as-of odds lookup.
    kickoff: new Date(row["kickoff"] as string | number | Date),
    seasonLabel: row["season_label"] ? String(row["season_label"]) : null,
    competitionCode: String(row["competition_code"]),
    trueOutcome: row["true_outcome"] as "HOME" | "DRAW" | "AWAY",
    probabilityHome: String(row["p_home"]),
    probabilityDraw: String(row["p_draw"]),
    probabilityAway: String(row["p_away"]),
  }));
}
