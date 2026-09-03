import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tooling/e2e",
  forbidOnly: true,
  fullyParallel: true,
  reporter: "list",
});
