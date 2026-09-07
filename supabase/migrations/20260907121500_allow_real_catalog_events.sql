-- The original Phase 1 check made every catalog event synthetic.  Production
-- provider ingestion needs the same catalog tables to represent real events;
-- provenance remains explicit on the event/provider/observation rows.
alter table catalog.events drop constraint if exists events_phase_one_synthetic_check;
alter table catalog.events add constraint events_synthetic_boolean_check
  check (synthetic in (true, false));
