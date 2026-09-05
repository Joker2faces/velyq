-- Prediction runs that failed or did not reach a consistent completed state.
select
  pr.id as prediction_run_id,
  pr.event_id,
  pr.status as prediction_status,
  pr.feature_cutoff,
  pr.started_at,
  pr.completed_at,
  pr.model_version_id,
  pr.calibration_version_id,
  pr.trigger_job_id,
  j.status as trigger_job_status,
  j.attempt_count,
  j.max_attempts,
  j.correlation_id,
  j.last_error as trigger_job_error
from intelligence.prediction_runs pr
left join operations.jobs j on j.id = pr.trigger_job_id
where pr.status <> 'COMPLETED'
   or pr.completed_at is null
   or j.status = 'FAILED'
order by coalesce(pr.started_at, pr.feature_cutoff) desc;
