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
  return parseLocale(store.get(LOCALE_COOKIE)?.value);
}

/**
 * Locale resolution for the not-found boundary only.
 *
 * On Cloudflare/Vinext that boundary renders with a cookie store that comes
 * back empty even though the request carried a cookie, so every 404 was
 * served in English to Greek visitors. Reading the raw `cookie` header fixes
 * it — but `headers()` is expensive enough that doing it in `getLocale()`
 * pushed ordinary page renders past the Workers 10ms CPU limit and 503'd the
 * whole site (measured: 6/6 failures with it in the hot path, 6/6 successes
 * without). It is confined here because 404s are rare, and because a request
 * that reaches this point has already skipped the real page render.
 */
export async function getNotFoundLocale(): Promise<Locale> {
  const store = await cookies();
  const fromStore = store.get(LOCALE_COOKIE)?.value;
  if (fromStore) return parseLocale(fromStore);
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
