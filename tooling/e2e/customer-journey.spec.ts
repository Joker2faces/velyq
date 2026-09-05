import { expect, test } from "@playwright/test";
import { customerMatchPath, signInAsCustomer } from "./customer-test-helpers";

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
    page.getByText("Your session is held and verified on our servers."),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Preview synthetic workspace/i }),
  ).toHaveCount(0);
  await expect(page.locator('a[href="/today"]')).toHaveCount(0);
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

test("authenticated customer can sign in, open Today, and inspect a Match", async ({
  page,
}) => {
  await signInAsCustomer(page);

  await expect(page).toHaveURL(/\/today$/);
  await expect(
    page.getByRole("heading", { name: "What needs your attention?" }),
  ).toBeVisible();
  await expect(page.getByText("SYNTHETIC DATA")).toBeVisible();
  await expect(page.getByText("SYNTHETIC DATA")).toBeVisible();
  await expect(page.getByRole("link", { name: /Admin console/i })).toHaveCount(
    0,
  );

  await page.locator(`a[href="${customerMatchPath}"]`).first().click();

  await expect(page).toHaveURL(new RegExp(`${customerMatchPath}$`));
  await expect(
    page.getByRole("heading", {
      name: /Northbridge United.*Riverside Athletic/,
    }),
  ).toBeVisible();
});

test("authenticated customer routes keep stable labels and protected state", async ({
  page,
}) => {
  await signInAsCustomer(page);

  const navigationLabels = ["Today", "EDGE", "RADAR", "Pricing", "Account"];
  const routes = [
    ["/today", "What needs your attention?"],
    ["/edge", "Value, with context."],
    ["/radar", "Movement, observed."],
    [customerMatchPath, /Northbridge United.*Riverside Athletic/],
    ["/account", "Your workspace."],
  ] as const;

  for (const [path, heading] of routes) {
    await page.goto(path);
    await expect(page).toHaveURL(
      new RegExp(`${String(path).replaceAll("/", "\\/")}$`),
    );
    await expect(page.locator("main#main-content")).toBeVisible();
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    await expect(
      page
        .getByRole("navigation", { name: "Primary navigation" })
        .getByRole("link"),
    ).toHaveText(navigationLabels);
    await expect(
      page.getByRole("link", { name: /Admin console/i }),
    ).toHaveCount(0);
  }
});

test("customer text controls meet focused accessibility and contrast checks", async ({
  page,
}) => {
  await page.goto("/sign-in");
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByRole("main")).toHaveAttribute("class", "auth__main");
  await expect(page.getByLabel("Email")).toHaveAttribute("id", "email");
  await expect(page.getByLabel("Password")).toHaveAttribute("id", "password");
  await expect(page.locator(".auth__card a")).toHaveCount(2);
  await expect(
    page.getByRole("link", { name: /Create account/i }),
  ).toHaveAttribute("href", "/sign-up");
  await expect(
    page.getByRole("link", { name: /Forgot your password/i }),
  ).toHaveAttribute("href", "/forgot-password");

  const signInContrast = await readContrastRatios(page, [
    ".auth__card h1",
    ".auth__card p:not(.eyebrow)",
    ".auth__card label",
    ".auth__card small",
    ".auth__card button",
  ]);
  expect(signInContrast.length).toBeGreaterThanOrEqual(5);
  expect(signInContrast.every(({ ratio }) => Number.isFinite(ratio))).toBe(
    true,
  );

  await signInAsCustomer(page);
  await expect(page.locator(".skip-link")).toHaveAttribute(
    "href",
    "#main-content",
  );
  await expect(page.locator("main#main-content")).toHaveAttribute(
    "id",
    "main-content",
  );
});

async function readContrastRatios(
  page: import("@playwright/test").Page,
  selectors: string[],
) {
  return page.evaluate((requestedSelectors) => {
    const parseColor = (value: string) => {
      const match = value.match(/rgba?\(([^)]+)\)/);
      if (!match) return null;
      const channels = match[1]!
        .split(",")
        .map((channel) => Number.parseFloat(channel));
      return [
        channels[0]!,
        channels[1]!,
        channels[2]!,
        channels[3] ?? 1,
      ] as const;
    };
    const luminance = (color: readonly number[]) =>
      color.slice(0, 3).reduce((sum, channel, index) => {
        const normalized = channel / 255;
        const linear =
          normalized <= 0.03928
            ? normalized / 12.92
            : ((normalized + 0.055) / 1.055) ** 2.4;
        return sum + linear * [0.2126, 0.7152, 0.0722][index]!;
      }, 0);
    const backgroundFor = (element: Element) => {
      let current: Element | null = element;
      while (current) {
        const background = parseColor(
          getComputedStyle(current).backgroundColor,
        );
        if (background && background[3] > 0) return background;
        current = current.parentElement;
      }
      return [0, 0, 0, 1] as const;
    };

    return requestedSelectors.flatMap((selector) =>
      Array.from(document.querySelectorAll(selector))
        .filter((element) => {
          const bounds = element.getBoundingClientRect();
          return bounds.width > 0 && bounds.height > 0;
        })
        .map((element) => {
          const foreground = parseColor(getComputedStyle(element).color)!;
          const background = backgroundFor(element);
          const foregroundLuminance = luminance(foreground);
          const backgroundLuminance = luminance(background);
          return {
            selector,
            ratio:
              (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
              (Math.min(foregroundLuminance, backgroundLuminance) + 0.05),
          };
        }),
    );
  }, selectors);
}
