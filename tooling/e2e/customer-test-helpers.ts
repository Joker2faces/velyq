import type { Page } from "@playwright/test";

export const customerMatchPath =
  "/matches/73000000-0000-4000-8000-000000000001";

export async function signInAsCustomer(page: Page) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("customer@example.test");
  await page.getByLabel("Password").fill("customer-password");
  const [response] = await Promise.all([
    page.waitForResponse(
      (candidate) =>
        candidate.url().includes("/api/v1/auth/sign-in") &&
        candidate.request().method() === "POST",
    ),
    page.getByRole("button", { name: "Continue with Supabase Auth" }).click(),
  ]);
  if (response.status() !== 307) {
    throw new Error(
      `Customer sign-in returned ${response.status()}: ${await response.text()}`,
    );
  }
  const cookies = await page.context().cookies();
  if (!cookies.some(({ name }) => name === "velyq_access_token")) {
    throw new Error(
      `Customer sign-in did not set an access cookie: ${response.headers()["set-cookie"] ?? "missing"}`,
    );
  }
  await page.waitForURL("**/today");
}
