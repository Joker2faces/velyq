"use client";

import { useEffect, type ReactNode } from "react";
import { translate, type Locale } from "@velyq/ui";
import { ErrorState, Skeleton } from "../components/ui";
import { redirectTo } from "../components/browser";
import { localePath } from "../locale-path";
import type { CustomerState } from "./customer-data";

/**
 * Renders the four answers a protected API can give, in VELYQ's own design.
 *
 * The shell is static, so until the API replies the visitor must see
 * something honest and branded rather than a blank page or, worse, anything
 * that implies access they may not have. Nothing private is rendered before
 * the API has said who they are.
 */
export function CustomerBoundary<T>({
  state,
  locale,
  children,
}: {
  state: CustomerState<T>;
  locale: Locale;
  children: (data: T) => ReactNode;
}) {
  const unauthenticated = state.status === "unauthenticated";

  useEffect(() => {
    if (!unauthenticated) return;
    /*
     * A fixed, internal destination — never a path taken from the URL, which
     * is how these redirects turn into open redirects.
     */
    redirectTo(localePath("/sign-in", locale));
  }, [unauthenticated, locale]);

  if (state.status === "ready") return <>{children(state.data)}</>;

  if (state.status === "forbidden") {
    return (
      <div className="page">
        <ErrorState
          title={translate("accessLockedTitle", locale)}
          body={translate("accessLockedBody", locale)}
        />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="page">
        <ErrorState
          title={translate("customerUnavailable", locale)}
          body={translate("customerUnavailableBody", locale)}
          action={
            <button
              type="button"
              className="button button--secondary"
              onClick={state.retry}
            >
              {translate("retry", locale)}
            </button>
          }
        />
      </div>
    );
  }

  /*
   * Loading, and the redirect case while the navigation is in flight: the
   * same skeleton, so a visitor on their way to sign-in never glimpses a
   * shape suggesting data they cannot see. `aria-busy` with a polite live
   * region announces the wait instead of leaving a screen reader silent.
   */
  return (
    <div className="page" aria-busy="true" aria-live="polite">
      <span className="sr-only">{translate("customerLoading", locale)}</span>
      <div className="card">
        <Skeleton variant="title" width="42%" />
        <Skeleton variant="line" width="70%" />
        <Skeleton variant="block" />
      </div>
      <div className="card">
        <Skeleton variant="line" width="55%" />
        <Skeleton variant="block" />
      </div>
    </div>
  );
}
