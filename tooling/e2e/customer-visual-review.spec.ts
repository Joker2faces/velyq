import { test } from "@playwright/test";

test("captures desktop and mobile customer entry renders", async ({ page }) => {
  await page.goto("/sign-in");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({
    path: test.info().outputPath("sign-in-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: test.info().outputPath("sign-in-mobile.png"),
    fullPage: true,
  });
});
