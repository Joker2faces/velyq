"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { writePreferenceCookie } from "./components/browser";
import {
  LOCALES,
  LOCALE_COOKIE,
  LOCALE_LABELS,
  LOCALE_SHORT_LABELS,
  translate,
  type Locale,
} from "@velyq/ui";

/**
 * Language switcher.
 *
 * Writes the preference to a cookie and asks Next.js to re-render the current
 * route on the server, so the whole page — copy, `<html lang>`, number and
 * date formatting — changes together. The previous implementation wrote to
 * `localStorage`, which the server cannot read, so the toggle changed nothing
 * but the highlighted button.
 *
 * The cookie is a display preference. It is not `HttpOnly` precisely because
 * it is written here in the browser, and it carries no security meaning:
 * nothing in the authorization path reads it.
 */
export function LanguageSwitcher({ locale }: { locale: Locale }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function choose(next: Locale) {
    if (next === locale) return;
    const oneYear = 60 * 60 * 24 * 365;
    writePreferenceCookie(LOCALE_COOKIE, next, oneYear);
    startTransition(() => {
      router.refresh();
    });
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
          data-pending={pending ? "true" : undefined}
          onClick={() => choose(option)}
        >
          {LOCALE_SHORT_LABELS[option]}
        </button>
      ))}
    </div>
  );
}
