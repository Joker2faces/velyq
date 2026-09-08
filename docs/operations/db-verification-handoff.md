# Database verification handoff

The implementation is ready for the existing GitHub workflow once the account billing lock is removed.

- Workflow: `.github/workflows/ci.yml` (`CI`)
- Required job: `db-integration`
- Migration command: `pnpm exec supabase db reset --local`
- Integration command: `pnpm test:db-integration`
- Environment: the workflow-owned local Supabase Postgres at `127.0.0.1:54322`; never production.

PASS requires: Supabase starts, every migration applies from an empty database, pgTAP/schema constraints pass, repository integration tests pass, and the workflow cleanup step stops Supabase. Any migration, constraint, settlement-correction, provenance, or repository failure is a failed gate.
