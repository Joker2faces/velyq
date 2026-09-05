/**
 * Customer-facing locale support.
 *
 * The locale is presentation state only. It never influences authorization,
 * entitlements or domain arithmetic — it selects a message catalog and an
 * `Intl` formatting locale.
 */
export type Locale = "en" | "el";

export const LOCALES: readonly Locale[] = ["en", "el"] as const;

export const DEFAULT_LOCALE: Locale = "en";

/** Name of the cookie that carries the customer's language preference. */
export const LOCALE_COOKIE = "velyq-locale";

/** Narrows arbitrary input (cookie, query string, header) to a known locale. */
export function parseLocale(value: string | null | undefined): Locale {
  return value === "el" ? "el" : DEFAULT_LOCALE;
}

/** Maps a VELYQ locale onto the BCP 47 tag used for `Intl` formatting. */
export function intlLocale(locale: Locale): string {
  return locale === "el" ? "el-GR" : "en-GB";
}

/** Human label for the locale, always rendered in its own language. */
export const LOCALE_LABELS: Readonly<Record<Locale, string>> = {
  en: "English",
  el: "Ελληνικά",
};

/** Short two-letter switcher label. */
export const LOCALE_SHORT_LABELS: Readonly<Record<Locale, string>> = {
  en: "EN",
  el: "EL",
};
