import { expect, test } from "@playwright/test";
import { buildDemoHistory } from "../../apps/web/app/customer/history-data";
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
  const rows = await page.locator(".results-row").allInnerTexts();
  expect(rows).toHaveLength(4);
  expect(rows[1]).toContain(
    "Σύνολο γκολ κανονικής διάρκειας · Πάνω 2.5 · Αξία",
  );
  expect(rows[3]).toContain(
    "Τελικό αποτέλεσμα 1Χ2 · Νίκη γηπεδούχου · Παρακολούθηση",
  );
  expect(rows.join("\n")).not.toMatch(
    /Over 2\.5|\b(?:EDGE|Edge|edge|WATCH|Watch|watch)\b/,
  );
  expect(history).not.toMatch(
    /Demo sample|all qualifying actionable decisions|Full-time/,
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

test("live History localizes empty and mixed model-version states", async ({
  page,
}) => {
  const demo = buildDemoHistory(new Date("2026-09-08T12:00:00.000Z"));
  let responseBody: Record<string, unknown> = {
    ...demo,
    syntheticLabel: "Live data" as const,
    period: "ALL_PERSISTED" as const,
    modelVersion: { state: "NONE" as const },
    decisions: [],
  };
  await page.route("**/api/v1/history*", async (route) => {
    await route.fulfill({ json: responseBody });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await signInAsCustomer(page);
  await page.goto("/results");
  await expect(page.getByText("No model version")).toBeVisible();

  await switchToGreek(page);
  await expect(page.getByText("Δεν υπάρχει έκδοση μοντέλου")).toBeVisible();

  responseBody = {
    ...demo,
    syntheticLabel: "Live data" as const,
    period: "ALL_PERSISTED" as const,
    modelVersion: { state: "MULTIPLE" as const, count: 2 },
    decisions: demo.decisions,
  };
  await page.reload();
  await expect(page.getByText("2 εκδόσεις μοντέλου")).toBeVisible();
  await expect(page.getByText("Multiple model versions")).toHaveCount(0);

  await page.getByRole("button", { name: "English" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByText("2 model versions")).toBeVisible();

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload();
  await expect(page.getByText("2 model versions")).toBeVisible();
  expect(await page.locator("html").evaluate((node) => node.scrollWidth)).toBe(
    1440,
  );
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
