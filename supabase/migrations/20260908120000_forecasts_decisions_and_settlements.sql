-- Product-intelligence history.  This migration is intentionally additive:
-- predictions remain the phase-one computation record; forecasts, decisions
-- and results make performance replayable without mutating that record.

CREATE TABLE intelligence.forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prediction_id uuid NOT NULL REFERENCES intelligence.predictions(id) ON DELETE RESTRICT,
  event_market_outcome_id uuid NOT NULL REFERENCES market.event_market_outcomes(id) ON DELETE RESTRICT,
  probability numeric(18,12) NOT NULL CHECK (probability >= 0 AND probability <= 1),
  confidence numeric(18,12), model_version text NOT NULL,
  feature_cutoff timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT forecasts_prediction_id_unique UNIQUE(prediction_id)
);
CREATE INDEX forecasts_outcome_created_at_idx ON intelligence.forecasts(event_market_outcome_id, created_at DESC);

CREATE TABLE intelligence.decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  forecast_id uuid NOT NULL REFERENCES intelligence.forecasts(id) ON DELETE RESTRICT,
  event_market_outcome_id uuid NOT NULL REFERENCES market.event_market_outcomes(id) ON DELETE RESTRICT,
  market_price_observation_id uuid REFERENCES market.odds_observations(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('STRONG_EDGE','NO_BET','WAIT','WAIT_FOR_LINEUP','INSUFFICIENT_DATA','EDGE_DISAPPEARED')),
  selection text NOT NULL, offered_odds numeric(18,8), fair_odds numeric(18,8), expected_value numeric(18,12),
  why_not_codes text[] NOT NULL, decision_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX decisions_outcome_created_at_idx ON intelligence.decisions(event_market_outcome_id, created_at DESC);
CREATE INDEX decisions_forecast_id_idx ON intelligence.decisions(forecast_id);

CREATE TABLE intelligence.event_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES catalog.events(id) ON DELETE RESTRICT,
  source_observation_id uuid NOT NULL REFERENCES operations.source_observations(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('FINAL','IN_PROGRESS','SCHEDULED','POSTPONED','CANCELLED','ABANDONED')),
  home_score integer, away_score integer, provider_observed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_results_source_event_unique UNIQUE(source_observation_id, event_id)
);
CREATE INDEX event_results_event_observed_at_idx ON intelligence.event_results(event_id, provider_observed_at DESC);

CREATE TABLE intelligence.market_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id uuid NOT NULL REFERENCES intelligence.decisions(id) ON DELETE RESTRICT,
  event_result_id uuid NOT NULL REFERENCES intelligence.event_results(id) ON DELETE RESTRICT,
  outcome text NOT NULL CHECK (outcome IN ('WIN','LOSS','VOID','UNSETTLED')),
  settlement_rule_version text NOT NULL, closing_odds numeric(18,8), clv numeric(18,12),
  settled_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT market_settlements_decision_id_unique UNIQUE(decision_id)
);
CREATE INDEX market_settlements_event_result_id_idx ON intelligence.market_settlements(event_result_id);

-- History is private service data until customer-facing record views have a
-- separately reviewed RLS policy. No anonymous or direct user access.
REVOKE ALL ON intelligence.forecasts, intelligence.decisions, intelligence.event_results, intelligence.market_settlements FROM anon, authenticated;
