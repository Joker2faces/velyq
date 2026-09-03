BEGIN;
SELECT plan(11);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.profiles'::regclass),
  'profiles has row-level security enabled'
);

SELECT ok(
  (SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.profiles'::regclass),
  'profiles forces row-level security for non-bypass owners'
);

SELECT ok(
  (
    SELECT bool_and(NOT has_schema_privilege('anon', schema_name, 'USAGE'))
    FROM unnest(ARRAY['audit', 'catalog', 'intelligence', 'market', 'operations', 'private']) AS schema_name
  ),
  'anon has no usage on internal schemas'
);

SELECT ok(
  (
    SELECT bool_and(NOT has_schema_privilege('authenticated', schema_name, 'USAGE'))
    FROM unnest(ARRAY['audit', 'catalog', 'intelligence', 'market', 'operations', 'private']) AS schema_name
  ),
  'authenticated has no usage on internal schemas'
);

SELECT ok(
  (
    SELECT bool_and(has_schema_privilege('service_role', schema_name, 'USAGE'))
    FROM unnest(ARRAY['audit', 'catalog', 'intelligence', 'market', 'operations', 'private']) AS schema_name
  ),
  'service_role has server-only usage on internal schemas'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_tables
    CROSS JOIN unnest(ARRAY['anon', 'authenticated']) AS roles(browser_role)
    WHERE schemaname IN ('audit', 'catalog', 'intelligence', 'market', 'operations', 'private')
      AND (
        has_table_privilege(browser_role::name, format('%I.%I', schemaname, tablename), 'SELECT')
        OR has_table_privilege(browser_role::name, format('%I.%I', schemaname, tablename), 'INSERT')
        OR has_table_privilege(browser_role::name, format('%I.%I', schemaname, tablename), 'UPDATE')
        OR has_table_privilege(browser_role::name, format('%I.%I', schemaname, tablename), 'DELETE')
        OR has_table_privilege(browser_role::name, format('%I.%I', schemaname, tablename), 'TRUNCATE')
        OR has_table_privilege(browser_role::name, format('%I.%I', schemaname, tablename), 'REFERENCES')
        OR has_table_privilege(browser_role::name, format('%I.%I', schemaname, tablename), 'TRIGGER')
      )
  ),
  'browser roles have no effective table privileges in internal schemas'
);

SELECT ok(
  (
    SELECT bool_and(NOT has_function_privilege('anon', pg_proc.oid, 'EXECUTE'))
    FROM pg_proc
    JOIN pg_namespace ON pg_namespace.oid = pg_proc.pronamespace
    WHERE pg_namespace.nspname = 'private'
  ),
  'anon cannot execute any private function directly'
);

SELECT ok(
  (
    SELECT bool_and(NOT has_function_privilege('authenticated', pg_proc.oid, 'EXECUTE'))
    FROM pg_proc
    JOIN pg_namespace ON pg_namespace.oid = pg_proc.pronamespace
    WHERE pg_namespace.nspname = 'private'
  ),
  'authenticated cannot execute any private function directly'
);

SELECT is(
  (
    SELECT count(*)
    FROM pg_proc
    JOIN pg_namespace ON pg_namespace.oid = pg_proc.pronamespace
    WHERE pg_namespace.nspname = 'private'
      AND pg_proc.prosecdef
  ),
  0::bigint,
  'private trigger functions use security invoker semantics'
);

SELECT ok(
  has_table_privilege('authenticated', 'public.profiles', 'SELECT')
    AND has_column_privilege('authenticated', 'public.profiles', 'display_name', 'UPDATE')
    AND has_column_privilege('authenticated', 'public.profiles', 'locale', 'UPDATE')
    AND has_column_privilege('authenticated', 'public.profiles', 'timezone', 'UPDATE')
    AND NOT has_column_privilege('authenticated', 'public.profiles', 'user_id', 'UPDATE')
    AND NOT has_column_privilege('authenticated', 'public.profiles', 'created_at', 'UPDATE')
    AND NOT has_column_privilege('authenticated', 'public.profiles', 'updated_at', 'UPDATE')
    AND NOT has_table_privilege('authenticated', 'public.profiles', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'public.profiles', 'DELETE')
    AND NOT has_table_privilege('anon', 'public.profiles', 'SELECT'),
  'profile browser grants are explicit and minimal'
);

SELECT ok(
  has_table_privilege('service_role', 'public.profiles', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'public.profiles', 'INSERT')
    AND NOT has_table_privilege('anon', 'public.profiles', 'INSERT'),
  'only the privileged server role can insert profiles directly'
);

SELECT * FROM finish();
ROLLBACK;
