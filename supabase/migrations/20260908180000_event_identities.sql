-- The bridge from a provider's own fixture key back to a VELYQ event.
--
-- Ingestion derives an event's UUID by hashing the provider's fixture id, so
-- the mapping existed but only in one direction: given the provider's id you
-- can compute the event, and given the event you can compute nothing. Every
-- later call that needs to ask the provider about a fixture we already store
-- — lineups, results, a repriced market — was therefore impossible without
-- re-discovering the fixture and spending quota to learn something already
-- known.
--
-- Modelled on `catalog.competition_identities` rather than as a column on
-- `catalog.events`, for the same reason: an event can be known to more than
-- one source, and the day a second provider appears, a single column becomes
-- a question about which provider it means.
create table if not exists catalog.event_identities (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references catalog.events (id) on delete cascade,
  source_code text not null,
  source_key text not null,
  created_at timestamptz not null default now(),
  -- One provider key names one event. A key that resolved to two events would
  -- make every downstream fetch ambiguous in a way nothing could detect.
  constraint event_identities_identity_unique unique (source_code, source_key),
  -- And one event has at most one key per provider, so a fixture re-ingested
  -- under a changed id is a visible conflict rather than a silent duplicate.
  constraint event_identities_event_source_unique unique (event_id, source_code)
);

create index if not exists event_identities_event_idx
  on catalog.event_identities (event_id);

revoke all on table catalog.event_identities from anon, authenticated;
grant select on table catalog.event_identities to authenticated;
grant select, insert, update, delete
  on table catalog.event_identities to service_role;
