import { defineConfig } from "vitest/config";

/**
 * A real-Postgres integration suite, deliberately excluded from the default
 * test glob (`vitest.config.mts`'s `packages/*&#47;test/**`) so it never
 * runs -- and never silently fails -- without a live database. Requires
 * DATABASE_URL to point at an ephemeral database (the local Supabase stack
 * in CI, never production): see `pnpm test:db-integration` and
 * `.github/workflows/ci.yml`'s `db-integration` job.
 */
export default defineConfig({
  test: {
    include: ["packages/database/test-integration/**/*.test.ts"],
    environment: "node",
    globals: false,
    // These tests share one live database sequentially by design (fixture
    // ingestion in one test must be visible to odds ingestion in the next).
    fileParallelism: false,
  },
});
