-- The admin's per-cycle candidate view, and the settlement record.
--
-- Two additions that answer two questions the pipeline could not previously
-- answer at all: "what did the model think about the markets it did not
-- recommend", and "what happened to the ones it did".

-- ------------------------------------------------- funnel candidate detail

-- Every market the cycle evaluated, with what the model and the market said.
--
-- The counts alone tell an administrator that six markets stopped at the
-- lineup gate; they do not say which six, what the model thought, or how far
-- it was from the market. That detail used to be reachable only by knowing a
-- prediction's UUID in advance, which is not a workflow.
--
-- It lives on the funnel run rather than on the prediction rows because most
-- of these markets legitimately have no prediction: a WATCH candidate a day
-- before kickoff has a model estimate and a market consensus but no decision,
-- and forcing a prediction row into existence to hold them would make the
-- prediction table a mix of decisions and non-decisions.
alter table intelligence.decision_funnel_runs
  add column if not exists candidates jsonb not null default '[]'::jsonb;

do $$
begin
  alter table intelligence.decision_funnel_runs
    add constraint decision_funnel_runs_candidates_array_check
    check (jsonb_typeof(candidates) = 'array');
exception
  when duplicate_object then null;
end
$$;

-- ------------------------------------------------------ event results

-- The final score, as the provider reported it.
--
-- Separate from `catalog.events.status` because a status is a lifecycle flag
-- while this is evidence: it carries the provider run that observed it and the
-- instant it was observed, so a settlement can be traced to the observation it
-- was based on rather than to whatever the score column happens to say now.
create table if not exists market.event_results (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references catalog.events (id) on delete restrict,
  source_observation_id uuid not null
    references operations.source_observations (id) on delete restrict,
  status text not null,
  home_goals smallint,
  away_goals smallint,
  half_time_home_goals smallint,
  half_time_away_goals smallint,
  provider_observed_at timestamptz not null,
  received_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint event_results_status_check
    check (status in ('FINISHED', 'ABANDONED', 'POSTPONED', 'CANCELLED', 'AWARDED')),
  -- A finished match has a score; anything else may legitimately not.
  constraint event_results_finished_score_check
    check (
      status <> 'FINISHED'
      or (home_goals is not null and away_goals is not null)
    ),
  constraint event_results_goals_check
    check (
      (home_goals is null or home_goals between 0 and 30)
      and (away_goals is null or away_goals between 0 and 30)
    ),
  constraint event_results_identity_unique unique (event_id, source_observation_id)
);

create index if not exists event_results_event_observed_idx
  on market.event_results (event_id, provider_observed_at desc);

-- --------------------------------------------------- prediction settlement

-- What happened to a published prediction, and separately, whether making it
-- was defensible.
--
-- The separation is the point and it is enforced by two columns rather than
-- described in a comment. A losing bet at a genuinely good price is a GOOD
-- decision with a LOST outcome, and collapsing the two into "was it right"
-- destroys the only feedback signal that can improve a decision policy —
-- outcomes are mostly noise at this sample size, decision quality is not.
create table if not exists intelligence.prediction_settlements (
  id uuid primary key default gen_random_uuid(),
  prediction_id uuid not null references intelligence.predictions (id) on delete restrict,
  event_result_id uuid not null references market.event_results (id) on delete restrict,
  outcome text not null,
  decision_quality text not null,
  -- The price the prediction was published at, and the closing price if one
  -- was ever observed. Their ratio is the closing-line value, which is a
  -- different and more informative signal than the outcome.
  publication_odds numeric(18, 8),
  publication_probability numeric(18, 12),
  closing_odds numeric(18, 8),
  closing_line_value numeric(18, 12),
  reason_codes text[] not null,
  settled_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint prediction_settlements_outcome_check
    check (outcome in ('WON', 'LOST', 'PUSH', 'VOID')),
  constraint prediction_settlements_quality_check
    check (
      decision_quality in ('GOOD', 'ACCEPTABLE', 'POOR', 'INSUFFICIENT_EVIDENCE')
    ),
  constraint prediction_settlements_numeric_check
    check (
      (publication_odds is null or publication_odds > 1)
      and (closing_odds is null or closing_odds > 1)
      and (
        publication_probability is null
        or publication_probability between 0 and 1
      )
    ),
  -- One settlement per prediction. A prediction settled twice would make the
  -- forecast ledger's own counts unreliable.
  constraint prediction_settlements_prediction_unique unique (prediction_id)
);

create index if not exists prediction_settlements_settled_idx
  on intelligence.prediction_settlements (settled_at desc);
create index if not exists prediction_settlements_event_result_idx
  on intelligence.prediction_settlements (event_result_id);

-- --------------------------------------------------------------- security

revoke all on table market.event_results from anon, authenticated;
revoke all on table intelligence.prediction_settlements from anon, authenticated;

grant select, insert, update, delete on table market.event_results to service_role;
grant select, insert, update, delete
  on table intelligence.prediction_settlements to service_role;

-- Both are evidence about the past, so both are append-only. A settlement that
-- can be rewritten after the fact is worse than no settlement record at all:
-- it looks like history and is not.
create trigger reject_market_event_results_mutation
before update or delete on market.event_results
for each row execute function private.reject_append_only_mutation();

create trigger reject_intelligence_prediction_settlements_mutation
before update or delete on intelligence.prediction_settlements
for each row execute function private.reject_append_only_mutation();
