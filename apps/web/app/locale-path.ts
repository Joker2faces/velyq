import type { Locale } from "@velyq/ui";

/**
 * Locale routing for the statically served public pages.
 *
 * Public pages are prerendered into the asset directory so Cloudflare can
 * serve them without invoking the Worker — the app's SSR costs more CPU than
 * the Workers Free allowance grants, and serving HTML from the Worker
 * exhausts it and 503s the site. A static file has no request context, so it
 * cannot read the locale cookie: the language has to be part of the URL.
 * English keeps the canonical paths, Greek lives under `/el`.
 *
 * Only these routes exist in both variants. Everything else — the
 * authenticated app and the API — is still rendered by the Worker, where the
 * cookie works as before, so `localePath` deliberately leaves those alone
 * rather than inventing an `/el` URL that no route would answer.
 */
export const STATIC_PUBLIC_ROUTES = [
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
] as const;

export const LOCALE_PATH_PREFIX: Record<Locale, string> = {
  en: "",
  el: "/el",
};

/** The path part of `href`, ignoring any `#fragment` or `?query`. */
function routeOf(href: string): string {
  const path = href.split("#")[0]!.split("?")[0]!;
  return path === "" ? "/" : path;
}

export function isStaticPublicRoute(href: string): boolean {
  return (STATIC_PUBLIC_ROUTES as readonly string[]).includes(routeOf(href));
}

/**
 * Rewrites an internal link so it points at the current locale's variant.
 *
 * Anything that is not one of the prerendered public routes is returned
 * unchanged: an external link, an API path, or an authenticated route that
 * only exists in one form.
 */
export function localePath(href: string, locale: Locale): string {
  if (!href.startsWith("/") || href.startsWith("//")) return href;
  const prefix = LOCALE_PATH_PREFIX[locale];
  if (!prefix) return href;
  if (!isStaticPublicRoute(href)) return href;
  const route = routeOf(href);
  const suffix = href.slice(route === "/" ? 1 : route.length);
  return route === "/" ? `${prefix}/${suffix}` : `${prefix}${route}${suffix}`;
}

/** The same page in the other language, for the language switcher. */
export function localeCounterpart(pathname: string, next: Locale): string {
  const bare = pathname.startsWith("/el/")
    ? pathname.slice(3)
    : pathname === "/el"
      ? "/"
      : pathname;
  return localePath(bare === "" ? "/" : bare, next);
}
