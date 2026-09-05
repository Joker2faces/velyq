import { execFileSync } from "node:child_process";

import { defineConfig, devices } from "@playwright/test";

const serializedPorts =
  process.env.VELYQ_E2E_PORTS ??
  execFileSync(process.execPath, ["tooling/e2e/ports.mjs"], {
    encoding: "utf8",
  });
process.env.VELYQ_E2E_PORTS = serializedPorts;
const ports = JSON.parse(serializedPorts) as {
  build: number;
  auth: number;
  customer: number;
  admin: number;
};
const buildUrl = `http://127.0.0.1:${ports.build}`;
const authUrl = `http://127.0.0.1:${ports.auth}`;
const customerUrl = `http://127.0.0.1:${ports.customer}`;
const adminUrl = `http://127.0.0.1:${ports.admin}`;
const e2eEnvironment = {
  VELYQ_E2E_BUILD_PORT: String(ports.build),
  VELYQ_E2E_AUTH_PORT: String(ports.auth),
  VELYQ_E2E_CUSTOMER_PORT: String(ports.customer),
  VELYQ_E2E_ADMIN_PORT: String(ports.admin),
};

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
      use: { baseURL: customerUrl },
    },
    {
      name: "admin",
      testMatch: /admin-.*\.spec\.ts/,
      use: { baseURL: adminUrl },
    },
  ],
  webServer: [
    {
      command: "node tooling/e2e/local-apps-build-server.mjs",
      url: `${buildUrl}/health`,
      env: e2eEnvironment,
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      command: "node tooling/e2e/customer-auth-stub.mjs",
      url: `${authUrl}/health`,
      env: e2eEnvironment,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: "node tooling/e2e/customer-web-server.mjs",
      url: `${customerUrl}/sign-in`,
      env: e2eEnvironment,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "node tooling/e2e/admin-web-server.mjs",
      url: `${adminUrl}/api/health`,
      env: e2eEnvironment,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
  forbidOnly: true,
  fullyParallel: true,
  reporter: "list",
});
