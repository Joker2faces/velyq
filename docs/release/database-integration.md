# Isolated PostgreSQL verification

Canonical local command:

```sh
pnpm test:db:local
```

The command creates a disposable PostgreSQL 17 database, applies every
`supabase/migrations/*.sql` file from zero in lexical order, applies
`supabase/seed.sql`, runs the complete database-integration Vitest project,
and stops PostgreSQL in a `finally` block. It never reads production database
credentials or provider credentials.

On Windows, enable WSL and install the `Ubuntu-24.04` distribution once:

```powershell
wsl --install --distribution Ubuntu-24.04
```

The harness downloads and extracts user-owned PGDG PostgreSQL 17 binaries into
the distribution cache; it does not install PostgreSQL system-wide. Linux CI
uses the pinned Supabase CLI/Docker workflow in `.github/workflows/ci.yml`.

Additional migration paths:

```sh
pnpm test:db:upgrade
pnpm test:db:production-upgrade
```

The first proves a normal branch upgrade. The second reproduces the verified
legacy production identity schema, including pre-existing identity anomalies,
then proves the additive reconciliation and future-write invariants. All test
databases are disposable and are stopped even when a migration or test fails.
