"use client";

import { useEffect, useState } from "react";

/**
 * Fetching for the customer surfaces, which are served as static shells.
 *
 * A static file is byte-identical for everyone who asks for it, so it can
 * carry no customer state at all. The shell therefore renders a skeleton and
 * asks a protected API, and the API's status *is* the answer — the shell
 * never infers access from anything baked into the HTML:
 *
 *   401 → no session      → send them to sign-in
 *   403 → no entitlement  → show the locked state
 *   200 → render their own data
 *
 * Everything private arrives here and nowhere else.
 */
export type CustomerState<T> =
  | { status: "loading" }
  | { status: "unauthenticated" }
  | { status: "forbidden" }
  | { status: "error"; retry: () => void }
  | { status: "ready"; data: T };

export function useCustomerData<T>(path: string): CustomerState<T> {
  const [state, setState] = useState<CustomerState<T>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const retry = () => setAttempt((value) => value + 1);

    (async () => {
      setState({ status: "loading" });
      let response: Response;
      try {
        /*
         * Same-origin is fetch's default, so the session cookie travels
         * without asking. `no-store` matters: a cached body must never
         * outlive a sign-out or a plan change.
         */
        response = await fetch(path, {
          cache: "no-store",
          headers: { accept: "application/json" },
        });
      } catch {
        if (!cancelled) setState({ status: "error", retry });
        return;
      }
      if (cancelled) return;

      if (response.status === 401) {
        setState({ status: "unauthenticated" });
        return;
      }
      if (response.status === 403) {
        setState({ status: "forbidden" });
        return;
      }
      if (!response.ok) {
        setState({ status: "error", retry });
        return;
      }
      try {
        const data = (await response.json()) as T;
        if (!cancelled) setState({ status: "ready", data });
      } catch {
        if (!cancelled) setState({ status: "error", retry });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [path, attempt]);

  return state;
}
