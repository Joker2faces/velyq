import { defineConfig } from "vitest/config";

/**
 * Writer cost measurements, in their own database.
 *
 * Deliberately separate from `vitest.db-integration.config.mts` rather than
 * merely another file inside it. These tests write a realistic bulk batch --
 * six bookmakers across two markets, twice over, plus a legacy comparison run
 * -- and the integration suite shares one database sequentially and asserts
 * exact global counts (`getForecastCoverageDiagnostic` expects a specific
 * number of skipped competitions). Bulk measurement data and exact-count
 * correctness assertions cannot share a fixture database without one
 * corrupting the other's premise, and the benchmark is the one that should
 * move.
 */
export default defineConfig({
  test: {
    include: ["packages/database/test-benchmark/**/*.test.ts"],
    environment: "node",
    globals: false,
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 180_000,
  },
});
