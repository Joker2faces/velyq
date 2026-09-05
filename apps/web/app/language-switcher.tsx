"use client";

import { useEffect, useState } from "react";

export function LanguageSwitcher() {
  const [locale, setLocale] = useState("en");
  useEffect(() => {
    const browser = globalThis as unknown as {
      localStorage?: { getItem: (key: string) => string | null };
    };
    setLocale(browser.localStorage?.getItem("velyq-locale") ?? "en");
  }, []);
  function choose(next: string) {
    setLocale(next);
    const browser = globalThis as unknown as {
      localStorage?: { setItem: (key: string, value: string) => void };
      document?: { documentElement: { lang: string } };
    };
    browser.localStorage?.setItem("velyq-locale", next);
    if (browser.document) browser.document.documentElement.lang = next;
  }
  return (
    <div className="language-switcher" aria-label="Language selector">
      <button
        type="button"
        aria-pressed={locale === "en"}
        onClick={() => choose("en")}
      >
        EN
      </button>
      <span>/</span>
      <button
        type="button"
        aria-pressed={locale === "el"}
        onClick={() => choose("el")}
      >
        EL
      </button>
    </div>
  );
}
