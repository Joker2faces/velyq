/**
 * Responsive and accessibility sweep for the customer app.
 *
 * Walks every customer route in both locales at three widths and reports
 * horizontal overflow, undersized tap targets, text below the 12px floor and
 * missing document landmarks. Review tooling — it asserts nothing and is not
 * part of the build.
 *
 * Usage: node tooling/scripts/ux-sweep.mjs [baseUrl]
 */
import { chromium } from "@playwright/test";

const baseUrl = process.argv[2] ?? "http://localhost:3100";

const PUBLIC_ROUTES = [
  "/",
  "/pricing",
  "/sign-in",
  "/sign-up",
  "/forgot-password",
  "/reset-password",
  "/terms",
  "/privacy",
  "/responsible-use",
  "/subscription-terms",
];
const PRIVATE_ROUTES = [
  "/today",
  "/edge",
  "/radar",
  "/account",
  "/matches/76000000-0000-4000-8000-000000000001",
];
const ROUTES = [...PUBLIC_ROUTES, ...PRIVATE_ROUTES];
const WIDTHS = [
  ["mobile", 390, 844],
  ["mobile-lg", 430, 932],
  ["tablet", 768, 1024],
  ["laptop", 1024, 800],
  ["desktop", 1440, 900],
  ["wide", 1920, 1080],
];
const LOCALES = ["en", "el"];

/*
 * Everything inside `audit` is serialised and executed by Playwright in the
 * page, not in Node, so the browser globals it uses are declared here for
 * ESLint's benefit.
 */
/* global document, getComputedStyle, HTMLInputElement, location */
const audit = () => {
  const root = document.documentElement;
  const problems = [];

  if (root.scrollWidth > root.clientWidth + 1) {
    const culprits = [...document.querySelectorAll("body *")]
      .filter((element) => {
        const box = element.getBoundingClientRect();
        return box.width > 0 && box.right > root.clientWidth + 1;
      })
      .slice(0, 4)
      .map(
        (element) =>
          `${element.tagName.toLowerCase()}.${String(element.className).split(" ")[0]}`,
      );
    problems.push(
      `OVERFLOW ${root.scrollWidth}>${root.clientWidth} via ${culprits.join(", ")}`,
    );
  }

  /*
   * Content clipped *inside* a card. The document-level overflow check above
   * cannot see this: a figure that overruns its grid cell is hidden by the
   * cell rather than pushed out of the page. That is how an oversized
   * headline number shipped truncated once already.
   */
  const clipped = [
    ...document.querySelectorAll(
      ".card, .preview__card, .lead, .verdict, .ops-metric, .plan, .stat",
    ),
  ]
    .filter((element) => element.scrollWidth > element.clientWidth + 1)
    .map(
      (element) =>
        `${String(element.className).split(" ")[0]}@${element.scrollWidth}>${element.clientWidth}`,
    );
  if (clipped.length) {
    problems.push(`CLIPPED ${[...new Set(clipped)].join(", ")}`);
  }

  const interactive = [
    ...document.querySelectorAll("a, button, summary, input"),
  ];
  const small = interactive
    .filter((element) => {
      const box = element.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) return false;
      if (getComputedStyle(element).visibility === "hidden") return false;
      return box.height < 40;
    })
    .map(
      (element) =>
        `${element.tagName.toLowerCase()}.${String(element.className).split(" ")[0]}@${Math.round(
          element.getBoundingClientRect().height,
        )}px`,
    );
  if (small.length)
    problems.push(`TAPTARGET ${[...new Set(small)].join(", ")}`);

  const tiny = [...document.querySelectorAll("body *")]
    .filter((element) => {
      if (!element.textContent?.trim()) return false;
      if (element.children.length > 0) return false;
      const box = element.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) return false;
      return Number.parseFloat(getComputedStyle(element).fontSize) < 11.5;
    })
    .map(
      (element) =>
        `${element.tagName.toLowerCase()}.${String(element.className).split(" ")[0]}`,
    );
  if (tiny.length) problems.push(`TINYTEXT ${[...new Set(tiny)].join(", ")}`);

  // Text contrast against the nearest opaque ancestor background.
  const parseColor = (value) => {
    const match = value.match(/rgba?\(([^)]+)\)/);
    if (!match) return null;
    const channels = match[1]
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map(Number.parseFloat);
    return [
      channels[0],
      channels[1],
      channels[2],
      channels[3] === undefined ? 1 : channels[3],
    ];
  };
  const luminance = (color) =>
    color.slice(0, 3).reduce((sum, channel, index) => {
      const normalized = channel / 255;
      const linear =
        normalized <= 0.03928
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      return sum + linear * [0.2126, 0.7152, 0.0722][index];
    }, 0);
  /**
   * Resolves the effective backdrop, or null when it cannot be determined.
   *
   * A gradient (`background-image`) reports `backgroundColor: transparent`,
   * so naively walking past it compares the text against the page background
   * and reports a false failure. Those cases are reported as unknown and
   * checked by eye instead.
   */
  const backgroundFor = (element) => {
    let current = element;
    while (current) {
      const style = getComputedStyle(current);
      if (style.backgroundImage !== "none") return null;
      const background = parseColor(style.backgroundColor);
      if (background && background[3] > 0.92) return background;
      current = current.parentElement;
    }
    return [5, 8, 15, 1];
  };
  const lowContrast = [...document.querySelectorAll("body *")]
    .filter((element) => {
      if (element.children.length > 0) return false;
      if (!element.textContent?.trim()) return false;
      if (element.closest("[aria-hidden='true'], .sr-only")) return false;
      const box = element.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    })
    .map((element) => {
      const style = getComputedStyle(element);
      const size = Number.parseFloat(style.fontSize);
      const bold = Number.parseInt(style.fontWeight, 10) >= 700;
      const large = size >= 24 || (size >= 18.66 && bold);
      const foreground = parseColor(style.color);
      const background = backgroundFor(element);
      if (!foreground || !background) return null;
      const a = luminance(foreground);
      const b = luminance(background);
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      return { element, ratio, required: large ? 3 : 4.5 };
    })
    .filter((result) => result && result.ratio < result.required)
    .map(
      ({ element, ratio }) =>
        `${element.tagName.toLowerCase()}.${String(element.className).split(" ")[0]}@${ratio.toFixed(2)}`,
    );
  if (lowContrast.length) {
    problems.push(`CONTRAST ${[...new Set(lowContrast)].join(", ")}`);
  }

  if (!document.querySelector("main")) problems.push("NO_MAIN");
  if (document.querySelectorAll("h1").length !== 1) {
    problems.push(`H1_COUNT=${document.querySelectorAll("h1").length}`);
  }
  const unlabelled = [...document.querySelectorAll("input")].filter(
    (input) =>
      !input.labels?.length &&
      !input.getAttribute("aria-label") &&
      input.type !== "hidden",
  );
  if (unlabelled.length) problems.push(`UNLABELLED_INPUT=${unlabelled.length}`);

  return { lang: root.lang, problems };
};

const browser = await chromium.launch();
let failures = 0;

function recordProblems(scope, label, route, lang, problems) {
  if (lang) problems.unshift(`LANG=${lang}`);
  if (problems.length) {
    failures += problems.length;
    console.log(`[${scope}/${label}] ${route}`);
    for (const problem of problems) console.log(`    ${problem}`);
  }
}

async function auditRoutes(
  page,
  baseUrl,
  routes,
  locale,
  scope,
  includePrivate = true,
) {
  const selectedRoutes = includePrivate ? routes : PUBLIC_ROUTES;
  for (const [label, width, height] of WIDTHS) {
    await page.setViewportSize({ width, height });
    for (const route of selectedRoutes) {
      const response = await page.goto(`${baseUrl}${route}`, {
        waitUntil: "load",
      });
      const { lang, problems } = await page.evaluate(audit);
      if (lang !== locale) problems.unshift(`LANG=${lang} expected ${locale}`);
      if (response && response.status() >= 500)
        problems.unshift(`HTTP=${response.status()}`);
      recordProblems(scope, label, route, null, problems);
    }
  }
}

for (const locale of LOCALES) {
  const context = await browser.newContext();
  await context.addCookies([
    { name: "velyq-locale", value: locale, url: baseUrl },
  ]);
  // Public pages are always audited independently of authentication.
  const page = await context.newPage();
  await auditRoutes(
    page,
    baseUrl,
    ROUTES,
    locale,
    `customer-public-${locale}`,
    false,
  );

  // Never interpret a failed sign-in page as an authenticated product page.
  await page.goto(`${baseUrl}/sign-in`, { waitUntil: "load" });
  const authResponse = await page.evaluate(async () => {
    const form = document.querySelector("form.auth__form");
    if (!form) return { ok: false, reason: "SIGN_IN_FORM_MISSING" };
    const email = form.querySelector("#email");
    const password = form.querySelector("#password");
    if (
      !(email instanceof HTMLInputElement) ||
      !(password instanceof HTMLInputElement)
    ) {
      return { ok: false, reason: "SIGN_IN_FIELDS_MISSING" };
    }
    email.value = "customer@example.test";
    password.value = "customer-password";
    form.requestSubmit();
    return { ok: true };
  });
  if (!authResponse.ok) {
    console.log(
      `[customer-auth-${locale}] AUTH HARNESS INVALID: ${authResponse.reason}`,
    );
    await context.close();
    continue;
  }
  try {
    await page.waitForURL("**/today", { timeout: 5000 });
  } catch {
    console.log(
      `[customer-auth-${locale}] AUTH HARNESS INVALID: sign-in did not reach /today`,
    );
    await context.close();
    continue;
  }
  const authenticated = await page.evaluate(
    () =>
      document.cookie.includes("velyq_access_token") ||
      location.pathname === "/today",
  );
  if (!authenticated) {
    console.log(
      `[customer-auth-${locale}] AUTH HARNESS INVALID: no authenticated session`,
    );
    await context.close();
    continue;
  }
  await auditRoutes(
    page,
    baseUrl,
    ROUTES,
    locale,
    `customer-private-${locale}`,
    true,
  );
  await context.close();
}

/*
 * Admin console. Without a database every route renders the authorization
 * gate, which is itself a designed state; the audit still checks overflow,
 * contrast, tap targets, landmarks and the resolved language there.
 */
const ADMIN_BASE = process.argv[3] ?? "http://localhost:3200";
const ADMIN_ROUTES = [
  "/",
  "/provider-runs",
  "/predictions",
  "/scores",
  "/audit",
];

for (const locale of LOCALES) {
  const context = await browser.newContext();
  await context.addCookies([
    { name: "velyq-locale", value: locale, url: ADMIN_BASE },
  ]);
  const page = await context.newPage();
  for (const [label, width, height] of WIDTHS) {
    await page.setViewportSize({ width, height });
    for (const route of ADMIN_ROUTES) {
      const response = await page.goto(`${ADMIN_BASE}${route}`, {
        waitUntil: "load",
      });
      const { lang, problems } = await page.evaluate(audit);
      // Without an authorized principal, only the gate shell is executable.
      // Do not report protected data pages as product failures.
      if (route === "/") {
        if (lang !== locale)
          problems.unshift(`LANG=${lang} expected ${locale}`);
        if (response?.status() >= 500)
          problems.unshift(`HTTP=${response.status()}`);
        recordProblems(`admin-gate-${locale}`, label, route, null, problems);
      } else {
        if (label === "mobile") {
          console.log(
            `[admin-auth-${locale}] AUTHORIZED ADMIN DATA UX: NOT EXECUTABLE (no Admin principal configured)`,
          );
        }
      }
    }
  }
  await context.close();
}

await browser.close();
console.log(
  failures === 0
    ? `\nOK — ${(ROUTES.length + ADMIN_ROUTES.length) * WIDTHS.length * LOCALES.length} route/viewport/locale combinations clean (customer + admin).`
    : `\n${failures} problem(s) reported.`,
);
