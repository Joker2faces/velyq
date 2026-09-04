import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tooling/e2e",
  use: { baseURL: "http://127.0.0.1:3100" },
  webServer: {
    command: "corepack pnpm --filter @velyq/web exec next dev -p 3100",
    url: "http://127.0.0.1:3100/sign-in",
    reuseExistingServer: true,
    timeout: 30_000,
  },
  forbidOnly: true,
  fullyParallel: true,
  reporter: "list",
});
