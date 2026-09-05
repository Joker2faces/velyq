-- Actionable jobs: overdue pending work, expired leases, and failures.
select
  j.id as job_id,
  j.type,
  j.status,
  j.attempt_count,
  j.max_attempts,
  j.available_at,
  j.started_at,
  j.lease_expires_at,
  j.lease_owner,
  j.correlation_id,
  j.causation_id,
  now() - j.created_at as age,
  j.last_error
from operations.jobs j
where (j.status = 'PENDING' and j.available_at <= now())
   or (j.status = 'RUNNING' and j.lease_expires_at <= now())
   or j.status = 'FAILED'
order by
  case j.status when 'FAILED' then 0 when 'RUNNING' then 1 else 2 end,
  j.available_at asc;
