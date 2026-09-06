"use client";

import { useEffect } from "react";
import { LOCALE_COOKIE, parseLocale, type Locale } from "@velyq/ui";
import {
  currentPathname,
  readPreferenceCookie,
  redirectTo,
} from "./components/browser";
import { localeCounterpart } from "./locale-path";

/**
 * Sends a returning Greek visitor to the Greek copy of a public page.
 *
 * Public pages are static assets, so the canonical paths always serve
 * English — one file answers everyone, and the server has no chance to read
 * a cookie. Without this, someone who chose Greek and then followed a
 * bookmark to `/pricing` would silently get English back, which is the one
 * thing the old cookie-based rendering did do correctly.
 *
 * Doing it in the browser keeps the page itself free of the Worker. It is
 * deliberately one-directional and only ever adds the `/el` prefix: it never
 * sends an English-preferring visitor away from a Greek URL they followed on
 * purpose, and `localeCounterpart` only rewrites routes that exist in both
 * languages, so there is nothing for a redirect to loop between.
 */
export function LocalePreference({ locale }: { locale: Locale }) {
  useEffect(() => {
    if (locale !== "en") return;
    const preferred = parseLocale(readPreferenceCookie(LOCALE_COOKIE));
    if (preferred === "en") return;

    const path = currentPathname();
    const counterpart = localeCounterpart(path, preferred);
    if (counterpart === path) return;
    redirectTo(`${counterpart}${locationQueryAndHash()}`);
  }, [locale]);

  return null;
}

function locationQueryAndHash() {
  const host = globalThis as unknown as {
    location?: { search?: string; hash?: string };
  };
  return `${host.location?.search ?? ""}${host.location?.hash ?? ""}`;
}
