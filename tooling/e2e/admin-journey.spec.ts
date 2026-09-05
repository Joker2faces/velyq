import { expect, test } from "@playwright/test";

test("admin entry point exposes the protected operations sign-in", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Operations access." }),
  ).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveAttribute(
    "autocomplete",
    "email",
  );
  await expect(page.getByLabel("Password")).toHaveAttribute(
    "autocomplete",
    "current-password",
  );
  await expect(page.getByText("Admin permission is required")).toBeVisible();
  await expect(page.getByRole("navigation")).toHaveCount(0);
});

test("admin rejects invalid credentials without creating a session", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Email").fill("not-an-admin@example.test");
  await page.getByLabel("Password").fill("incorrect-password");
  const [response] = await Promise.all([
    page.waitForResponse(
      (candidate) =>
        candidate.url().includes("/api/v1/auth/sign-in") &&
        candidate.request().method() === "POST",
    ),
    page.getByRole("button", { name: "Continue to admin" }).click(),
  ]);

  expect(response.status()).toBe(401);
  expect(await response.json()).toMatchObject({ code: "INVALID_CREDENTIALS" });
  await expect(page).toHaveURL(/\/api\/v1\/auth\/sign-in$/);
  expect(
    (await page.context().cookies()).some(
      ({ name }) => name === "velyq_access_token",
    ),
  ).toBe(false);
});

test("admin auth endpoint issues server-side session cookies for valid auth", async ({
  request,
}) => {
  const response = await request.post("/api/v1/auth/sign-in", {
    form: {
      email: "admin@example.test",
      password: "admin-password",
    },
    maxRedirects: 0,
  });

  expect(response.status()).toBe(307);
  expect(new URL(response.headers()["location"]).pathname).toBe("/");
  const cookies = response
    .headersArray()
    .filter(({ name }) => name.toLowerCase().includes("set-cookie"));
  expect(cookies).toHaveLength(2);
  for (const { value } of cookies) {
    expect(value).toContain("HttpOnly");
    expect(value).toContain("SameSite=Lax");
  }
});

test("authorized admin traces seeded operations from run to prediction, score, and quality", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Email").fill("admin@example.test");
  await page.getByLabel("Password").fill("admin-password");
  await page.getByRole("button", { name: "Continue to admin" }).click();

  await expect(page).toHaveURL("http://127.0.0.1:3200/");
  await expect(
    page.getByRole("heading", { name: "Traceability console." }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Admin navigation" }),
  ).toBeVisible();

  await page.goto("/provider-runs/32000000-0000-4000-8000-000000000001");
  await expect(
    page.getByRole("heading", { name: "sequence-01-opening" }),
  ).toBeVisible();
  await expect(page.getByText("9", { exact: true })).toBeVisible();

  await page.goto("/predictions/56000000-0000-4000-8000-000000000001");
  await expect(page.getByRole("heading", { name: "NO_BET" })).toBeVisible();
  await expect(
    page.getByText("72000000-0000-4000-8000-000000000011"),
  ).toBeVisible();

  await page.goto("/scores/58000000-0000-4000-8000-000000000001");
  await expect(page.getByRole("heading", { name: "64.2500" })).toBeVisible();
  await expect(page.getByText(/DEVELOPMENT_HEURISTIC/)).toBeVisible();

  await page.goto("/quality/51000000-0000-4000-8000-000000000001");
  await expect(page.getByRole("heading", { name: "Grade GOOD" })).toBeVisible();
  await expect(page.getByText("88.5000", { exact: true })).toBeVisible();
});

test("admin liveness is non-sensitive", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
    status: "ok",
    service: "velyq-admin",
    syntheticOnly: true,
  });
});
