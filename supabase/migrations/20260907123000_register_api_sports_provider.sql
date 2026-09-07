insert into operations.providers (id, code, display_name, is_synthetic, created_at)
values (
  '30000000-0000-4000-8000-000000000002',
  'API_SPORTS',
  'API-Sports',
  false,
  now()
)
on conflict (code) do update
set display_name = excluded.display_name,
    is_synthetic = false;

insert into operations.provider_policy_versions (
  id, provider_id, version, policy, effective_from, created_at
)
select
  '31000000-0000-4000-8000-000000000002',
  p.id,
  'api-sports.v1',
  '{"providerCode":"API_SPORTS","version":"api-sports.v1","providerMode":"REAL","effectiveFrom":"2026-09-07T00:00:00Z","effectiveTo":null,"grants":[{"action":"RETAIN_NORMALIZED","environments":["PRODUCTION","STAGING","DEVELOPMENT","TEST"],"dataCategories":["NORMALIZED_FIXTURE","NORMALIZED_ODDS","NORMALIZED_LINEUP"],"requiredAttribution":true,"retentionDays":3650},{"action":"DISPLAY","environments":["PRODUCTION","STAGING","DEVELOPMENT","TEST"],"dataCategories":["NORMALIZED_FIXTURE","NORMALIZED_ODDS","NORMALIZED_LINEUP"],"audiences":["CUSTOMER","ADMIN"],"requiredAttribution":true}]}'::jsonb,
  now(),
  now()
from operations.providers p
where p.code = 'API_SPORTS'
on conflict (provider_id, version) do nothing;
