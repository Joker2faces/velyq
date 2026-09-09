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
    ["results", "/results"],
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
      /*
       * Every customer route is a static shell that fetches its own data, so
       * navigation resolving says nothing about whether the page has content.
       * This used to screenshot immediately, which raced the fetch: the same
       * route captured 900px of loading skeleton on one attempt and 3575px
       * of loaded content on the next, so a full-page baseline could not
       * match either reliably. `CustomerBoundary` marks the skeleton
       * aria-busy, so waiting for that to clear is a route-agnostic way to
       * photograph the settled page.
       */
      await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
      await expect(page).toHaveScreenshot(`${name}-${viewportName}.png`, {
        fullPage: true,
      });
    }
  }
});
