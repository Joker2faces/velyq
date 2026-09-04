# `@velyq/database`

This package owns the Phase 1 Drizzle schema and narrow database repository
operations.

## Privileged profile creation

Browser sessions may select and update only their own `public.profiles` row.
They are intentionally not granted direct `INSERT` access. A trusted BFF or
server use case creates the row with `createPrivilegedDatabaseClient` and
`createProfileWithPrivilegedConnection`.

The privileged direct-database connection string is server-only. A Supabase
service-role/secret credential used by any later Data API adapter has the same
boundary. Neither credential may be exposed to a browser bundle, client
environment variable, or untrusted caller. There is deliberately no public
`SECURITY DEFINER` function or signup trigger for profile creation in Phase 1.
