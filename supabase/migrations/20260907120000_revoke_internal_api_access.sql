-- Internal VELYQ domain schemas are server-side only.  The customer and admin
-- applications use a privileged server database session, while browser roles
-- must not be able to enumerate or mutate provider, market, operations,
-- intelligence, catalog, or audit data through PostgREST.
revoke all on schema audit, catalog, intelligence, market, operations from anon, authenticated;

do $$
declare
  target record;
begin
  for target in
    select table_schema, table_name
    from information_schema.tables
    where table_schema in ('audit', 'catalog', 'intelligence', 'market', 'operations')
      and table_type = 'BASE TABLE'
  loop
    execute format(
      'revoke all on table %I.%I from anon, authenticated',
      target.table_schema,
      target.table_name
    );
  end loop;
end
$$;

do $$
declare
  target record;
begin
  for target in
    select sequence_schema, sequence_name
    from information_schema.sequences
    where sequence_schema in ('audit', 'catalog', 'intelligence', 'market', 'operations')
  loop
    execute format(
      'revoke all on sequence %I.%I from anon, authenticated',
      target.sequence_schema,
      target.sequence_name
    );
  end loop;
end
$$;
