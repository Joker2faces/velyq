import { expect, test, type Page } from "@playwright/test";
import { LIVE_DATA_LABEL, type CustomerMatchDto } from "@velyq/contracts";
import type { TodaySurfaceDto } from "../../apps/web/app/customer/today-surface";
import { signInAsCustomer } from "./customer-test-helpers";

async function routeLiveVelyqOne(
  page: Page,
  recommendation: CustomerMatchDto["recommendation"] = "STRONG_EDGE",
) {
  await page.route("**/api/v1/today?surface=today", async (route) => {
    const response = await route.fetch();
    const data = (await response.json()) as TodaySurfaceDto;
    const first = data.matches[0];
    if (!first) throw new Error("Today fixture is required for VELYQ ONE QA");

    const selected = {
      ...first,
      eventId: "76000000-0000-4000-8000-000000000001",
      homeTeam: "Athens Athletic Football Club",
      awayTeam: "Thessaloniki United Athletic Association",
      competition: "competition.gre_super_league",
      startsAt: "2026-09-20T18:00:00.000Z",
      syntheticLabel: LIVE_DATA_LABEL,
      recommendation,
      freshness: "CURRENT",
      lineup: "OFFICIAL",
      modelProbability: "0.6",
      currentOdds: "1.85",
      impliedProbability: "0.540540540541",
      probabilityEdge: "0.059459459459",
      expectedValue: "0.11",
      priceValidity: {
        status: "ATTRACTIVE",
        policyVersion: "price-validity.v1",
        breakEvenOdds: "1.66666667",
        minimumAcceptableOdds: "1.7",
      },
      quality: {
        grade: "A",
        score: "1",
        policyVersion: "quality-policy.v1",
        reasonCodes: [],
      },
      bookmakerCount: 4,
    } as unknown as CustomerMatchDto;
    await route.fulfill({
      response,
      json: {
        ...data,
        syntheticLabel: LIVE_DATA_LABEL,
        asOf: "2026-09-20T12:00:00.000Z",
        matches: [selected],
        summary: {
          totalFixtures: 1,
          byRecommendation: {
            STRONG_EDGE: recommendation === "STRONG_EDGE" ? 1 : 0,
            NO_BET: recommendation === "NO_BET" ? 1 : 0,
            WAIT: 0,
            WAIT_FOR_LINEUP: 0,
            INSUFFICIENT_DATA: 0,
            EDGE_DISAPPEARED: 0,
          },
          lineupGated: 0,
        },
        withheld: 0,
        full: true,
      } satisfies TodaySurfaceDto,
    });
  });
}

test("VELYQ ONE renders its verified selection without overflow in EN and EL", async ({
  page,
}) => {
  const browserMessages: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning")
      browserMessages.push(message.text());
  });
  await routeLiveVelyqOne(page);
  await page.setViewportSize({ width: 360, height: 844 });
  await signInAsCustomer(page);

  const one = page.locator(".velyq-one");
  await expect(one).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Today’s strongest verified selection",
    }),
  ).toBeVisible();
  await expect(one.getByText("Athens Athletic Football Club")).toBeVisible();
  await expect(one.getByText("1.85", { exact: true })).toBeVisible();
  await expect(one.getByText("Minimum acceptable odds")).toBeVisible();
  await expect(one.getByText("1.70", { exact: true })).toBeVisible();
  await expect(
    one.getByRole("link", { name: "View match analysis" }),
  ).toHaveAttribute("href", "/matches/76000000-0000-4000-8000-000000000001");

  for (const width of [
    360, 390, 430, 736, 768, 820, 1120, 1216, 1220, 1280, 1359, 1360, 1440,
  ]) {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    await page.reload();
    await expect(one).toBeVisible();
    expect(
      await page.locator("html").evaluate((node) => node.scrollWidth),
    ).toBe(width);
    const cardBox = await one.boundingBox();
    const metricsBox = await one.locator(".velyq-one__metrics").boundingBox();
    expect(cardBox).not.toBeNull();
    expect(metricsBox).not.toBeNull();
    expect(metricsBox!.x + metricsBox!.width).toBeLessThanOrEqual(
      cardBox!.x + cardBox!.width + 0.5,
    );
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Ελληνικά" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "el");
  await expect(
    page.getByRole("heading", {
      name: "Η ισχυρότερη επαληθευμένη επιλογή της ημέρας",
    }),
  ).toBeVisible();
  await expect(one.getByText("Ελάχιστη αποδεκτή απόδοση")).toBeVisible();
  await expect(
    one.getByRole("link", { name: "Δες την ανάλυση αγώνα" }),
  ).toBeVisible();
  expect(browserMessages).toEqual([]);
});

test("VELYQ ONE renders an honest no-selection state", async ({ page }) => {
  await routeLiveVelyqOne(page, "NO_BET");
  await signInAsCustomer(page);

  const one = page.locator(".velyq-one");
  await expect(
    one.getByRole("heading", { name: "No selection right now" }),
  ).toBeVisible();
  await expect(
    one.getByText(
      "No available selection meets the evidence and price requirements right now.",
    ),
  ).toBeVisible();
  await expect(
    one.getByRole("link", { name: "View match analysis" }),
  ).toHaveCount(0);
  await expect(one.getByRole("link", { name: "Explore EDGE" })).toBeVisible();
});
