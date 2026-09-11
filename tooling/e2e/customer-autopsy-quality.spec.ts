import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

// The demo fixture intentionally has no settlement history. Render the actual
// server component with the application's CSS, without a production test route.
const css = readFileSync("apps/web/app/globals.css", "utf8").replace(
  '@import "@velyq/ui/tokens.css";',
  readFileSync("packages/ui/src/tokens.css", "utf8"),
);

for (const locale of ["en", "el"] as const) {
  for (const width of [390, 1440]) {
    test(`quality evidence expands accessibly in ${locale} at ${width}px`, async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (["error", "warning"].includes(message.type()))
          errors.push(message.text());
      });
      const title =
        locale === "en" ? "Post-match autopsy" : "Ανάλυση μετά τον αγώνα";
      const label =
        locale === "en" ? "Quality at decision" : "Ποιότητα κατά την απόφαση";
      const absent = locale === "en" ? "Not recorded" : "Δεν καταγράφηκε";
      // Playwright transforms JSX into its own component-test objects.
      // Use the app's real React server renderer in a separate TSX process.
      const markup = execFileSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "--input-type=module",
          "--eval",
          `import { recordedAutopsy, renderAutopsy } from './apps/web/test/autopsy-render.ts';
          process.stdout.write(renderAutopsy(process.argv[1], {
            ...recordedAutopsy,
            rows: [recordedAutopsy.rows[0], { ...recordedAutopsy.rows[0], selection: 'AWAY', outcome: 'LOSS', qualityAtDecision: null }],
          }));`,
          locale,
        ],
        {
          encoding: "utf8",
          windowsHide: true,
          env: {
            ...process.env,
            TSX_TSCONFIG_PATH: "tooling/e2e/react-render-tsconfig.json",
          },
        },
      );
      await page.setViewportSize({ width, height: 900 });
      await page.route("**/autopsy-component", (route) =>
        route.fulfill({
          contentType: "text/html; charset=utf-8",
          body: `<!doctype html><html lang="${locale}"><head><title>${title}</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><main class="app__content"><section class="card"><h1>${title}</h1>${markup}</section></main></body></html>`,
        }),
      );
      await page.goto("/autopsy-component");
      await expect(page).toHaveURL(/\/autopsy-component$/);
      await expect(page).toHaveTitle(title);
      await expect(page.getByRole("heading", { name: title })).toBeVisible();
      const disclosure = page.locator("details.autopsy-quality");
      const summary = disclosure.locator("summary");
      await expect(summary).toContainText(label);
      await expect(summary).toContainText("C · 61.2500");
      await expect(page.getByText("RECORDED_QUALITY · v0")).toBeHidden();
      await summary.focus();
      await page.keyboard.press("Enter");
      await expect(disclosure).toHaveAttribute("open", "");
      await expect(page.getByText("RECORDED_QUALITY · v0")).toBeVisible();
      await expect(disclosure.locator("time")).toHaveAttribute(
        "datetime",
        "2026-09-19T11:00:00Z",
      );
      await expect(page.getByText(`${label}: ${absent}`)).toBeVisible();
      expect(
        await summary.evaluate((node) => node.getBoundingClientRect().height),
      ).toBeGreaterThanOrEqual(44);
      expect(
        await page.locator("html").evaluate((node) => node.scrollWidth),
      ).toBe(width);
      await expect(page.locator("nextjs-portal")).toHaveCount(0);
      await page.screenshot({
        path: join(tmpdir(), `velyq-task12-${locale}-${width}.png`),
        fullPage: true,
      });
      await summary.click();
      await expect(disclosure).not.toHaveAttribute("open", "");
      await expect(page.getByText("RECORDED_QUALITY · v0")).toBeHidden();
      expect(errors).toEqual([]);
    });
  }
}
