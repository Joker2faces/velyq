-- Fixture kickoff is not a provider result-update instant. Permit unknown
-- provider observation times without altering any previously stored evidence.
ALTER TABLE operations.source_observations
  ALTER COLUMN provider_observed_at DROP NOT NULL;
ALTER TABLE intelligence.event_results
  ALTER COLUMN provider_observed_at DROP NOT NULL;
