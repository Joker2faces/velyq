alter table operations.provider_sync_runs
  add column if not exists normalized_output_hash text;

comment on column operations.provider_sync_runs.normalized_output_hash is
  'SHA-256 hash of the deterministic normalized replay batch; distinct from content_hash.';
