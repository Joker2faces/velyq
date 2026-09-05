import { cookies } from "next/headers";
import {
  LOCALE_COOKIE,
  parseLocale,
  translator,
  type Locale,
  type Translator,
} from "@velyq/ui";

/**
 * Server-side locale resolution for the admin console.
 *
 * The admin app runs on its own origin, so it reads the same cookie name
 * independently rather than sharing state with the customer app. The value is
 * a display preference and is never consulted for authorization.
 */
export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  return parseLocale(store.get(LOCALE_COOKIE)?.value);
}

export async function getTranslator(): Promise<{
  locale: Locale;
  t: Translator;
}> {
  const locale = await getLocale();
  return { locale, t: translator(locale) };
}
