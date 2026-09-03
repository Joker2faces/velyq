BEGIN;
SELECT plan(6);

SELECT is(
  (
    SELECT count(*)
    FROM information_schema.tables
    WHERE table_type = 'BASE TABLE'
      AND table_schema IN ('audit', 'catalog', 'intelligence', 'market', 'operations', 'private', 'public')
  ),
  35::bigint,
  'the Phase 1 schemas contain exactly 35 base tables'
);

SELECT set_eq(
  $$
    SELECT table_schema || '.' || table_name
    FROM information_schema.tables
    WHERE table_type = 'BASE TABLE'
      AND table_schema IN ('audit', 'catalog', 'intelligence', 'market', 'operations', 'private', 'public')
  $$,
  ARRAY[
    'audit.admin_audit_events',
    'catalog.competitions',
    'catalog.event_participants',
    'catalog.events',
    'catalog.participants',
    'catalog.sports',
    'intelligence.calibration_versions',
    'intelligence.data_quality_assessments',
    'intelligence.data_quality_policy_versions',
    'intelligence.lineup_observations',
    'intelligence.model_definitions',
    'intelligence.model_versions',
    'intelligence.prediction_inputs',
    'intelligence.prediction_runs',
    'intelligence.predictions',
    'intelligence.radar_evidence',
    'intelligence.score_definition_versions',
    'intelligence.score_results',
    'market.bookmakers',
    'market.event_market_outcomes',
    'market.event_markets',
    'market.market_definitions',
    'market.odds_observations',
    'market.outcome_definitions',
    'market.provider_market_mappings',
    'operations.jobs',
    'operations.provider_policy_versions',
    'operations.provider_sync_runs',
    'operations.providers',
    'operations.source_observations',
    'private.permissions',
    'private.role_permissions',
    'private.roles',
    'private.user_roles',
    'public.profiles'
  ]::text[],
  'the exact qualified Phase 1 allowlist is present'
);

SELECT is(
  (
    SELECT count(*)
    FROM information_schema.tables
    WHERE table_name IN (
      'seasons',
      'venues',
      'officials',
      'lineup_entries',
      'injuries',
      'raw_payloads',
      'event_results',
      'market_settlements',
      'backtest_runs',
      'subscriptions',
      'saved_matches',
      'notifications',
      'bet_slips',
      'live_signals',
      'provider_credentials',
      'dead_letter_archive'
    )
  ),
  0::bigint,
  'future Phase tables are absent'
);

SELECT is(
  (
    SELECT count(*)
    FROM information_schema.columns
    WHERE table_schema IN ('audit', 'catalog', 'intelligence', 'market', 'operations', 'private', 'public')
      AND data_type = 'timestamp without time zone'
  ),
  0::bigint,
  'all Phase 1 timestamps retain timezone information'
);

SELECT is(
  (
    SELECT count(*)
    FROM pg_class AS table_class
    JOIN pg_namespace AS namespace ON namespace.oid = table_class.relnamespace
    WHERE table_class.relkind = 'r'
      AND namespace.nspname IN ('audit', 'catalog', 'intelligence', 'market', 'operations', 'private', 'public')
      AND NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = table_class.oid
          AND contype = 'p'
      )
  ),
  0::bigint,
  'every Phase 1 table has a primary key'
);

SELECT set_eq(
  $$
    SELECT indexname
    FROM pg_indexes
    WHERE indexname IN (
      'user_roles_role_id_user_id_idx',
      'events_starts_at_status_idx',
      'events_competition_id_starts_at_idx',
      'provider_policy_versions_provider_id_effective_from_idx',
      'provider_sync_runs_provider_id_started_at_idx',
      'provider_sync_runs_status_started_at_idx',
      'source_observations_sync_run_id_idx',
      'source_observations_provider_id_observed_at_idx',
      'event_markets_event_id_market_definition_id_idx',
      'odds_observations_outcome_bookmaker_observed_at_idx',
      'odds_observations_bookmaker_observed_at_idx',
      'odds_observations_received_at_idx',
      'lineup_observations_event_team_received_at_idx',
      'data_quality_assessments_event_id_as_of_idx',
      'data_quality_assessments_market_outcome_id_as_of_idx',
      'prediction_runs_event_id_feature_cutoff_idx',
      'predictions_outcome_id_created_at_idx',
      'predictions_decision_status_created_at_idx',
      'prediction_inputs_source_observation_id_idx',
      'score_results_outcome_id_as_of_idx',
      'score_results_definition_id_as_of_idx',
      'jobs_status_available_at_idx',
      'jobs_lease_expires_at_idx',
      'jobs_correlation_id_idx',
      'admin_audit_events_actor_occurred_at_idx',
      'admin_audit_events_resource_occurred_at_idx'
    )
  $$,
  ARRAY[
    'user_roles_role_id_user_id_idx',
    'events_starts_at_status_idx',
    'events_competition_id_starts_at_idx',
    'provider_policy_versions_provider_id_effective_from_idx',
    'provider_sync_runs_provider_id_started_at_idx',
    'provider_sync_runs_status_started_at_idx',
    'source_observations_sync_run_id_idx',
    'source_observations_provider_id_observed_at_idx',
    'event_markets_event_id_market_definition_id_idx',
    'odds_observations_outcome_bookmaker_observed_at_idx',
    'odds_observations_bookmaker_observed_at_idx',
    'odds_observations_received_at_idx',
    'lineup_observations_event_team_received_at_idx',
    'data_quality_assessments_event_id_as_of_idx',
    'data_quality_assessments_market_outcome_id_as_of_idx',
    'prediction_runs_event_id_feature_cutoff_idx',
    'predictions_outcome_id_created_at_idx',
    'predictions_decision_status_created_at_idx',
    'prediction_inputs_source_observation_id_idx',
    'score_results_outcome_id_as_of_idx',
    'score_results_definition_id_as_of_idx',
    'jobs_status_available_at_idx',
    'jobs_lease_expires_at_idx',
    'jobs_correlation_id_idx',
    'admin_audit_events_actor_occurred_at_idx',
    'admin_audit_events_resource_occurred_at_idx'
  ]::text[],
  'all Section 8 query indexes are present'
);

SELECT * FROM finish();
ROLLBACK;
