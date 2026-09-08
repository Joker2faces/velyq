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
  },
});
