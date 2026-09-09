import { defineConfig } from "vitest/config";

export default defineConfig({
  oxc: {
    jsx: { runtime: "automatic" },
  },
  test: {
    include: [
      "apps/*/test/**/*.test.ts",
      "packages/*/test/**/*.test.ts",
      /*
       * `workers/` was absent from this list, so `workers/prediction`'s suite
       * had never executed — not in CI, not locally. A test file that exists
       * and never runs is worse than no test: it reads as coverage.
       * `tooling/test/test-discovery.test.ts` now fails if any test directory
       * stops being matched here.
       */
      "workers/*/test/**/*.test.ts",
      "tooling/test/**/*.test.ts",
    ],
    environment: "node",
    globals: false,
    /*
     * Vitest's 5000ms default is too tight for this repository, and three
     * separate files have now hit it for the same non-defect reason: a test
     * whose body runs in microseconds times out because its
     * `await import(...)` of a large module graph (@velyq/database ->
     * drizzle, @velyq/auth, the customer runtime) queues behind esbuild
     * transform workers while ~100 other test files transform in parallel.
     * It reproduces only under a full parallel run, never in isolation, and
     * always on the first dynamic import in a file -- the cold-transform
     * cost, not the assertions.
     *
     * Two files previously carried their own `vi.setConfig({ testTimeout })`
     * for exactly this. One deliberate global value is more honest than
     * per-file overrides accumulating one flake at a time: it says the
     * bound belongs to the runner's transform behaviour, not to any test's
     * logic. Kept finite so a genuinely hung test still fails.
     */
    testTimeout: 20_000,
  },
});
