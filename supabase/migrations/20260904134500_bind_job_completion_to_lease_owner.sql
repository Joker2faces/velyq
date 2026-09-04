alter table operations.jobs
  add column if not exists lease_owner text;

comment on column operations.jobs.lease_owner is
  'Worker identity that owns the current lease; completion and failure must match it.';

alter table operations.jobs
  drop constraint if exists jobs_state_check;

alter table operations.jobs
  add constraint jobs_state_check check (
    (status = 'PENDING' and lease_expires_at is null and lease_owner is null and completed_at is null)
    or (status = 'RUNNING' and lease_expires_at is not null and lease_owner is not null and started_at is not null and completed_at is null)
    or (status = 'COMPLETED' and lease_expires_at is null and lease_owner is null and started_at is not null and completed_at is not null and last_error is null)
    or (status = 'FAILED' and lease_expires_at is null and lease_owner is null and started_at is not null and completed_at is not null and last_error is not null)
  );
