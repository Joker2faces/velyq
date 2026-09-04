-- Latest observation age by provider and type.
-- Change stale_after only for an explicitly documented service objective.
with parameters as (
  select interval '15 minutes' as stale_after
), latest as (
  select
    p.code as provider_code,
    p.is_synthetic,
    o.observation_type,
    max(o.provider_observed_at) as latest_provider_observed_at,
    max(o.received_at) as latest_received_at,
    count(*) as total_observations
  from operations.source_observations o
  join operations.providers p on p.id = o.provider_id
  group by p.code, p.is_synthetic, o.observation_type
)
select
  l.provider_code,
  l.is_synthetic,
  l.observation_type,
  l.latest_provider_observed_at,
  l.latest_received_at,
  now() - l.latest_received_at as receive_age,
  p.stale_after,
  l.total_observations
from latest l
cross join parameters p
where l.latest_received_at < now() - p.stale_after
order by l.latest_received_at asc;
