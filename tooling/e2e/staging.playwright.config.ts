import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: /staging-smoke\.spec\.ts/,
  forbidOnly: true,
  fullyParallel: false,
  reporter: "list",
  retries: 1,
  use: {
    ...devices["Desktop Chrome"],
    trace: "retain-on-failure",
  },
});
