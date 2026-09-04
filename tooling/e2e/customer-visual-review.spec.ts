import { expect, test } from "@playwright/test";
import { customerMatchPath, signInAsCustomer } from "./customer-test-helpers";

test("captures desktop and mobile renders for every customer route", async ({
  page,
}) => {
  await page.goto("/sign-in");
  const routes = [
    ["sign-in", "/sign-in"],
    ["today", "/today"],
    ["edge", "/edge"],
    ["radar", "/radar"],
    ["match", customerMatchPath],
    ["account", "/account"],
  ] as const;

  for (const [name, path] of routes) {
    if (path !== "/sign-in") await signInAsCustomer(page);
    for (const [viewportName, width, height] of [
      ["desktop", 1440, 900],
      ["mobile", 390, 844],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.goto(path);
      await expect(page).toHaveScreenshot(`${name}-${viewportName}.png`, {
        fullPage: true,
      });
    }
  }
});
