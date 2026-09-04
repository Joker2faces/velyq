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
      command: "corepack pnpm --filter @velyq/web exec next dev -p 3100",
      url: "http://localhost:3100/sign-in",
      reuseExistingServer: true,
      timeout: 30_000,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:3101",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "e2e-publishable-key",
        NEXT_PUBLIC_VELYQ_ADMIN_URL: "https://admin.velyq.test",
        VELYQ_SYNTHETIC_PREVIEW: "true",
      },
    },
  ],
  forbidOnly: true,
  fullyParallel: true,
  reporter: "list",
});
