import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tooling/e2e",
  use: { baseURL: "http://localhost:3100" },
  webServer: [
    {
      command: "node tooling/e2e/customer-auth-stub.mjs",
      url: "http://localhost:3101/health",
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: "node tooling/e2e/customer-web-server.mjs",
      url: "http://localhost:3100/sign-in",
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
  forbidOnly: true,
  fullyParallel: true,
  reporter: "list",
});
