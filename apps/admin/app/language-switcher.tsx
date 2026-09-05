"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import {
  LOCALES,
  LOCALE_COOKIE,
  LOCALE_LABELS,
  LOCALE_SHORT_LABELS,
  translate,
  type Locale,
} from "@velyq/ui";

/**
 * Language switcher for the admin console.
 *
 * Mirrors the customer implementation: the preference is written to a cookie
 * and the route re-rendered on the server, so copy and `<html lang>` change
 * together. Carries no security meaning.
 */
export function LanguageSwitcher({ locale }: { locale: Locale }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  function choose(next: Locale) {
    if (next === locale) return;
    const browser = globalThis as unknown as { document?: { cookie: string } };
    if (!browser.document) return;
    browser.document.cookie = `${LOCALE_COOKIE}=${next};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
    startTransition(() => router.refresh());
  }

  return (
    <div
      className="lang"
      role="group"
      aria-label={translate("languageSelector", locale)}
    >
      {LOCALES.map((option) => (
        <button
          className="lang__option"
          key={option}
          type="button"
          lang={option}
          aria-pressed={option === locale}
          aria-label={LOCALE_LABELS[option]}
          onClick={() => choose(option)}
        >
          {LOCALE_SHORT_LABELS[option]}
        </button>
      ))}
    </div>
  );
}
