import { defineConfig } from "vitest/config";

export default defineConfig({
  oxc: {
    jsx: { runtime: "automatic" },
  },
  test: {
    include: [
      "apps/*/test/**/*.test.ts",
      "packages/*/test/**/*.test.ts",
      "tooling/test/**/*.test.ts",
    ],
    environment: "node",
    globals: false,
  },
});
