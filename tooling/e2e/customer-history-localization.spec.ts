import { expect, test } from "@playwright/test";
import { signInAsCustomer } from "./customer-test-helpers";

async function switchToGreek(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Ελληνικά" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "el");
}

test("Greek History localizes decision, market, outcome and demo metadata", async ({
  page,
}) => {
  await signInAsCustomer(page);
  await switchToGreek(page);
  await page.goto("/results");

  await expect(
    page.getByRole("heading", { name: "Ιστορικό αποφάσεων" }),
  ).toBeVisible();
  const history = await page.locator("main#main-content").innerText();
  expect(history).toContain(
    "Δείγμα επίδειξης · όλες οι επιλέξιμες ενεργές αποφάσεις",
  );
  expect(history).toContain("Σύνολο γκολ κανονικής διάρκειας");
  expect(history).toContain("Πάνω 2.5");
  expect(history).toContain("Αξία");
  expect(history).toContain("Παρακολούθηση");
  expect(history).toContain("Northbridge United");
  expect(history).not.toMatch(
    /Demo sample|all qualifying actionable decisions|Full-time|Over 2\.5|\bEdge\b|\bWatch\b/,
  );
});

test("English History retains its customer vocabulary", async ({ page }) => {
  await signInAsCustomer(page);
  await page.goto("/results");

  await expect(
    page.getByRole("heading", { name: "Decision history" }),
  ).toBeVisible();
  const history = await page.locator("main#main-content").innerText();
  expect(history).toContain(
    "Demo sample · all qualifying actionable decisions",
  );
  expect(history).toContain("Full-time goals");
  expect(history).toContain("Over 2.5");
  expect(history).toContain("Edge");
  expect(history).toContain("Watch");
});

test("Greek authenticated header keeps a compact VELYQ mark without overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAsCustomer(page);
  await switchToGreek(page);

  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/results");

    const topbar = page.locator(".app__topbar");
    const brand = topbar.locator(".app__mobile-brand .brand");
    await expect(brand).toBeVisible();
    await expect(brand).toContainText("VELYQ");
    await expect(brand.locator(".brand__tag")).toBeHidden();
    expect(
      await page.locator("html").evaluate((node) => node.scrollWidth),
    ).toBe(width);

    const controls = await topbar.locator("a, button").evaluateAll((nodes) =>
      nodes.map((node) => {
        const bounds = node.getBoundingClientRect();
        return { width: bounds.width, height: bounds.height };
      }),
    );
    expect(
      controls.every(({ width, height }) => width >= 44 && height >= 44),
    ).toBe(true);
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/results");
  await expect(page.locator(".app__sidebar .brand")).toBeVisible();
  await expect(page.locator(".app__mobile-brand")).toBeHidden();
  expect(await page.locator("html").evaluate((node) => node.scrollWidth)).toBe(
    1440,
  );
});
