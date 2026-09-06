"use client";

import { useEffect, useState } from "react";
import { LOCALE_COOKIE, parseLocale, translate, type Locale } from "@velyq/ui";
import { readPreferenceCookie } from "./components/browser";
import { ErrorState } from "./components/ui";

/*
 * Without this boundary an uncaught render error gives the visitor Next's
 * stock error screen — unstyled, English-only, and indistinguishable from the
 * site being down. This keeps a failure inside the product: VELYQ's own
 * design, the visitor's own language, a way to retry and a way home.
 *
 * It deliberately renders no chrome and pulls in no data. The one job of an
 * error boundary is to work when something else did not, so it depends on as
 * little as possible.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  /*
   * Server-side locale resolution is unavailable here, so the language comes
   * from the same non-sensitive cookie the switcher writes. English until the
   * effect runs, which matches the server's own default.
   */
  const [locale, setLocale] = useState<Locale>("en");
  useEffect(() => {
    setLocale(parseLocale(readPreferenceCookie(LOCALE_COOKIE)));
  }, []);

  useEffect(() => {
    // Surfaced for Wrangler tail / the browser console; `digest` is the only
    // handle that ties this back to a specific server-side failure.
    console.error("[velyq] unhandled application error", error.digest, error);
  }, [error]);

  return (
    <div className="page">
      <ErrorState
        title={translate("errorTitle", locale)}
        body={translate("errorBody", locale)}
        action={
          <button
            type="button"
            className="button button--secondary"
            onClick={reset}
          >
            {translate("retry", locale)}
          </button>
        }
      />
    </div>
  );
}
