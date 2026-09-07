-- Provisions the FOOTBALL sport and its two core market definitions.
--
-- Two real defects are being fixed here, both discovered by applying this
-- repository's migration chain to an empty PostgreSQL cluster:
--
-- 1. `20260907130000_provision_real_market_catalog.sql` inserts the BTTS
--    market definition against sport `2000…0001` and maps API-Sports markets
--    '1' and '5' onto market definitions `4000…0001`/`4000…0002`. None of
--    those three rows is created by any migration — they exist only in
--    `supabase/seed.sql`, which `supabase db reset` applies *after* the
--    migrations and which a hosted project never applies at all. On a fresh
--    database that migration therefore fails outright with
--    `market_definitions_sport_id_sports_id_fk`.
--
-- 2. More seriously for production: real API-Sports ingestion inserts
--    `market.event_markets` via `select … from market.market_definitions
--    where code = 'FOOTBALL_FULL_TIME_1X2'`. If that definition was never
--    provisioned, the select matches nothing, the insert silently writes zero
--    rows, and no event market, outcome or odds observation is ever created
--    for football — with no error anywhere. Canonical market catalog is
--    production data, not local fixture data, so it belongs in a migration.
--
-- Deliberately timestamped *before* 20260907130000 so a fresh database
-- applies it first. That makes it out-of-order for any database where
-- 130000 has already been applied; it is purely additive and every statement
-- is idempotent, so applying it late is safe (`supabase db push` may need
-- `--include-all` to pick it up).
insert into catalog.sports (id, code, name_key, created_at)
values ('20000000-0000-4000-8000-000000000001', 'FOOTBALL', 'sport.football', now())
on conflict (code) do nothing;

insert into market.market_definitions (
  id, sport_id, code, family_code, period_code, structure, subject_type,
  line_required, line_rules, settlement_rule_version, label_key, created_at
)
values
  ('40000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','FOOTBALL_FULL_TIME_1X2','MATCH_RESULT','FULL_TIME','THREE_WAY','EVENT',false,'{"allowed":false}'::jsonb,'FOOTBALL_1X2_FULL_TIME_V1','market.match_result.full_time',now()),
  ('40000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','FOOTBALL_FULL_TIME_TOTAL','TOTAL','FULL_TIME','TWO_WAY','EVENT',true,'{"increments":["0.5"]}'::jsonb,'FOOTBALL_TOTAL_2_5_FULL_TIME_V1','market.total.full_time',now())
on conflict (id) do nothing;

insert into market.outcome_definitions (id, market_definition_id, code, label_key, sort_order, created_at)
values
  ('41000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','HOME','outcome.home',1,now()),
  ('41000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000001','DRAW','outcome.draw',2,now()),
  ('41000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000001','AWAY','outcome.away',3,now()),
  ('41000000-0000-4000-8000-000000000004','40000000-0000-4000-8000-000000000002','OVER','outcome.over',1,now()),
  ('41000000-0000-4000-8000-000000000005','40000000-0000-4000-8000-000000000002','UNDER','outcome.under',2,now())
on conflict (id) do nothing;
