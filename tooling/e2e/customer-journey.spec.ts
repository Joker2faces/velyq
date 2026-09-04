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

test("sign-in exposes keyboard labels and a visible focus target", async ({
  page,
}) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").focus();
  await expect(page.getByLabel("Email")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Password")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByLabel("Email")).toBeFocused();
});
