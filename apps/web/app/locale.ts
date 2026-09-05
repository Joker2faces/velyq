import { cookies } from "next/headers";
import {
  LOCALE_COOKIE,
  parseLocale,
  translator,
  type Locale,
  type Translator,
} from "@velyq/ui";

/**
 * Server-side locale resolution.
 *
 * The customer's language lives in a cookie so that the *server* renders the
 * correct copy and the correct `<html lang>` on the very first paint. The
 * previous implementation kept the choice in `localStorage`, which the server
 * cannot read — so the page said "EL" while rendering English, and announced
 * `lang="el"` over English text to screen readers.
 *
 * The cookie carries a display preference only. It is never read for
 * authorization and never influences entitlements.
 */
export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  return parseLocale(store.get(LOCALE_COOKIE)?.value);
}

/** Resolves the locale and returns a translator bound to it. */
export async function getTranslator(): Promise<{
  locale: Locale;
  t: Translator;
}> {
  const locale = await getLocale();
  return { locale, t: translator(locale) };
}
