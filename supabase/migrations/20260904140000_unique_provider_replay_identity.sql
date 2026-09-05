create unique index if not exists provider_sync_runs_replay_identity_unique
  on operations.provider_sync_runs (provider_id, replay_sequence, started_at);
