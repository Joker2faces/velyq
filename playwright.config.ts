import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tooling/e2e",
  snapshotPathTemplate: "{testDir}/{testFilePath}-snapshots/{arg}{ext}",
  use: {
    ...devices["Desktop Chrome"],
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "customer",
      testMatch: /customer-.*\.spec\.ts/,
      use: { baseURL: "http://127.0.0.1:3100" },
    },
    {
      name: "admin",
      testMatch: /admin-.*\.spec\.ts/,
      use: { baseURL: "http://127.0.0.1:3200" },
    },
  ],
  webServer: [
    {
      command: "node tooling/e2e/local-apps-build-server.mjs",
      url: "http://127.0.0.1:3099/health",
      reuseExistingServer: true,
      timeout: 180_000,
    },
    {
      command: "node tooling/e2e/customer-auth-stub.mjs",
      url: "http://127.0.0.1:3101/health",
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: "node tooling/e2e/customer-web-server.mjs",
      url: "http://127.0.0.1:3100/sign-in",
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: "node tooling/e2e/admin-web-server.mjs",
      url: "http://127.0.0.1:3200/api/health",
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
  forbidOnly: true,
  fullyParallel: true,
  reporter: "list",
});
