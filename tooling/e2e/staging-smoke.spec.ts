import { expect, test, type Page } from "@playwright/test";

const customerUrl = process.env["VELYQ_STAGING_CUSTOMER_URL"];
const adminUrl = process.env["VELYQ_STAGING_ADMIN_URL"];
const customerEmail = process.env["VELYQ_STAGING_CUSTOMER_EMAIL"];
const customerPassword = process.env["VELYQ_STAGING_CUSTOMER_PASSWORD"];
const adminEmail = process.env["VELYQ_STAGING_ADMIN_EMAIL"];
const adminPassword = process.env["VELYQ_STAGING_ADMIN_PASSWORD"];

function skipWithout(
  values: Readonly<Record<string, string | undefined>>,
): void {
  const missing = Object.entries(values)
    .filter(([, value]) => !value)
    .map(([name]) => name);
  test.skip(
    missing.length > 0,
    `Staging smoke not executed; missing secrets: ${missing.join(", ")}`,
  );
}

async function signIn(
  page: Page,
  baseUrl: string,
  email: string,
  password: string,
  buttonName: string,
) {
  await page.goto(baseUrl);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: buttonName }).click();
}

test("staging customer can authenticate and reach Today", async ({ page }) => {
  skipWithout({
    VELYQ_STAGING_CUSTOMER_URL: customerUrl,
    VELYQ_STAGING_CUSTOMER_EMAIL: customerEmail,
    VELYQ_STAGING_CUSTOMER_PASSWORD: customerPassword,
  });

  await signIn(
    page,
    new URL("/sign-in", customerUrl!).toString(),
    customerEmail!,
    customerPassword!,
    "Continue with Supabase Auth",
  );
  await expect(page).toHaveURL(new URL("/today", customerUrl!).toString());
  await expect(
    page.getByRole("heading", { name: "What needs your attention?" }),
  ).toBeVisible();
});

test("staging administrator can authenticate and reach the console", async ({
  page,
}) => {
  skipWithout({
    VELYQ_STAGING_ADMIN_URL: adminUrl,
    VELYQ_STAGING_ADMIN_EMAIL: adminEmail,
    VELYQ_STAGING_ADMIN_PASSWORD: adminPassword,
  });

  await signIn(
    page,
    new URL("/", adminUrl!).toString(),
    adminEmail!,
    adminPassword!,
    "Continue to admin",
  );
  await expect(page).toHaveURL(new URL("/", adminUrl!).toString());
  await expect(
    page.getByRole("heading", { name: "Traceability console." }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Admin navigation" }),
  ).toBeVisible();
});
