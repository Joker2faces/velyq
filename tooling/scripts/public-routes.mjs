/**
 * The routes that are prerendered into the asset directory, in both locales.
 *
 * This is the single list the build step and the application agree on:
 * `apps/web/app/locale-path.ts` mirrors it, and a test asserts the two match.
 * A route prerendered here but not linked as a locale variant is
 * unreachable; a route linked but not prerendered is a 404.
 *
 * Public only. Anything that renders per-customer state stays on the Worker —
 * a static asset is served to everyone, so putting authenticated output in
 * one would hand one customer's page to the next visitor.
 */
export const PUBLIC_ROUTES = [
  "/",
  "/pricing",
  "/terms",
  "/privacy",
  "/responsible-use",
  "/subscription-terms",
  "/sign-in",
  "/sign-up",
  "/forgot-password",
  "/reset-password",
];

/**
 * Authenticated surfaces, prerendered as *shells* only.
 *
 * These carry no customer state at all: identity, plan, entitlements and the
 * match data itself are fetched from protected APIs once the page is
 * running. That is what makes them safe to freeze into a file that everyone
 * receives — and the prerender step scans the output to prove it, refusing
 * to write anything that looks like one customer's data.
 */
export const CUSTOMER_SHELL_ROUTES = ["/today", "/edge", "/radar", "/account"];

/** Locale is carried by the URL for static pages: EN canonical, EL under /el. */
export const LOCALES = [
  { code: "en", prefix: "" },
  { code: "el", prefix: "/el" },
];
