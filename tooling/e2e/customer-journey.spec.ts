import { expect, test } from "@playwright/test";

test("public sign-in presents the customer entry contract", async ({
  page,
}) => {
  await page.goto("/sign-in");
  await expect(page).toHaveTitle(/VELYQ/i);
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveAttribute(
    "autocomplete",
    "email",
  );
  await expect(page.getByLabel("Password")).toHaveAttribute(
    "autocomplete",
    "current-password",
  );
  await expect(
    page.getByText("Protected by the VELYQ server-side session boundary."),
  ).toBeVisible();
});

test("anonymous customer navigation is redirected to sign-in", async ({
  page,
}) => {
  await page.goto("/today");
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
});
