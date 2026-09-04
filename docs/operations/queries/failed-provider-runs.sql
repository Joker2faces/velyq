-- Failed or degraded provider runs from the last 24 hours.
-- Read-only: returns failures, incomplete runs, explicit errors, and rejections.
select
  r.id as provider_run_id,
  p.code as provider_code,
  p.is_synthetic,
  r.capability,
  r.status,
  r.replay_sequence,
  r.started_at,
  r.completed_at,
  r.received_count,
  r.accepted_count,
  r.rejected_count,
  r.content_hash as source_content_hash,
  r.normalized_output_hash,
  r.error_summary
from operations.provider_sync_runs r
join operations.providers p on p.id = r.provider_id
where coalesce(r.started_at, r.completed_at) >= now() - interval '24 hours'
  and (
    r.status <> 'COMPLETED'
    or r.completed_at is null
    or r.error_summary is not null
    or r.rejected_count > 0
  )
order by coalesce(r.started_at, r.completed_at) desc nulls last;
