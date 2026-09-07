import { defineConfig } from "vitest/config";

export default defineConfig({
  oxc: {
    jsx: { runtime: "automatic" },
  },
  test: {
    include: [
      "apps/*/test/**/*.test.ts",
      "packages/*/test/**/*.test.ts",
      /* The workers were absent from this list, so `workers/prediction`'s
         suite had never run in CI or locally. */
      "workers/*/test/**/*.test.ts",
      "tooling/test/**/*.test.ts",
    ],
    environment: "node",
    globals: false,
  },
});
