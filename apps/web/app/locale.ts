import { cookies, headers } from "next/headers";
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
  const fromStore = store.get(LOCALE_COOKIE)?.value;
  if (fromStore) return parseLocale(fromStore);

  /*
   * Fallback for render paths where the cookie store comes back empty even
   * though the request carried a cookie — observed on Cloudflare/Vinext for
   * the not-found boundary, which rendered every 404 in English (and with
   * `<html lang="en">`) for Greek visitors. Reading the raw header covers
   * that case and costs nothing anywhere else.
   */
  try {
    const header = (await headers()).get("cookie") ?? "";
    for (const part of header.split(";")) {
      const [key, ...rest] = part.trim().split("=");
      if (key === LOCALE_COOKIE)
        return parseLocale(decodeURIComponent(rest.join("=")));
    }
  } catch {
    // No request context at all (static render): the default is correct.
  }
  return parseLocale(undefined);
}

/** Resolves the locale and returns a translator bound to it. */
export async function getTranslator(): Promise<{
  locale: Locale;
  t: Translator;
}> {
  const locale = await getLocale();
  return { locale, t: translator(locale) };
}
