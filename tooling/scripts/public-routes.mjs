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

/** Locale is carried by the URL for static pages: EN canonical, EL under /el. */
export const LOCALES = [
  { code: "en", prefix: "" },
  { code: "el", prefix: "/el" },
];
