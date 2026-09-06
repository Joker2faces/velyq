"use client";

import { useEffect, useState } from "react";
import { translate, type Locale, type MessageKey } from "@velyq/ui";
import { FormError } from "./auth-shell";
import { readQueryParameter, markFieldsInvalid } from "./browser";

/**
 * The auth error banner, rendered in the browser.
 *
 * These pages are prerendered into static assets so Cloudflare can serve them
 * without invoking the Worker, which means there is no `searchParams` at
 * render time — one file answers `/sign-in` and `/sign-in?error=invalid`
 * alike. The banner therefore reads the query itself once mounted.
 *
 * It keeps the distinction the server drew: a provider outage is not a
 * rejected credential, and must never be reported as one. It also re-applies
 * the ARIA wiring the server used to emit, so the message is still announced
 * and still associated with the fields it refers to.
 */
/**
 * What an `?error=` value means, independent of React.
 *
 * Kept as a plain function so the invariant that matters — a service outage
 * must never be reported as a rejected credential, and must never mark the
 * customer's input invalid — is testable without a DOM.
 */
export function resolveAuthError(error: string | null): {
  visible: boolean;
  unavailable: boolean;
  markInvalid: boolean;
} {
  const unavailable = error === "unavailable";
  return {
    visible: Boolean(error),
    unavailable,
    markInvalid: Boolean(error) && !unavailable,
  };
}

export function AuthError({
  locale,
  id,
  invalidKey,
  unavailableKey,
  fieldIds,
}: {
  locale: Locale;
  id: string;
  invalidKey: MessageKey;
  unavailableKey: MessageKey;
  /** Fields marked invalid for a rejected credential — never for an outage. */
  fieldIds: readonly string[];
}) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(readQueryParameter("error"));
  }, []);

  const unavailable = error === "unavailable";
  useEffect(() => {
    if (!error) return;
    markFieldsInvalid(fieldIds, id, !unavailable);
  }, [error, unavailable, fieldIds, id]);

  if (!error) return null;
  return (
    <FormError id={id}>
      {translate(unavailable ? unavailableKey : invalidKey, locale)}
    </FormError>
  );
}
