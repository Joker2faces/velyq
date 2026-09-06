/**
 * Narrowly typed browser accessors.
 *
 * The workspace TypeScript baseline (`tooling/typescript/base.json`) sets
 * `lib: ["ES2024"]` and deliberately does not include the DOM library, so
 * `document` and `window` are not in scope even inside client components.
 * Rather than widen the shared compiler options for the whole monorepo, these
 * helpers reach through `globalThis` with the smallest possible surface —
 * the same pattern the app already used before this refactor.
 */

type CookieHost = { cookie: string };
type LocationHost = {
  hash: string;
  pathname?: string;
  search?: string;
  assign?: (url: string) => void;
};

function browser() {
  return globalThis as unknown as {
    document?: CookieHost;
    location?: LocationHost;
  };
}

/** The current path, or "/" when there is no browser (SSR, tests). */
export function currentPathname(): string {
  return browser().location?.pathname ?? "/";
}

/**
 * A full navigation, not a client-side route change.
 *
 * The locale variants of public pages are static assets rather than routes
 * the Next router knows about, so pushing them through the client router
 * would not resolve.
 */
export function redirectTo(url: string) {
  browser().location?.assign?.(url);
}

/** Writes a first-party, non-sensitive preference cookie. */
export function writePreferenceCookie(
  name: string,
  value: string,
  maxAgeSeconds: number,
) {
  const host = browser().document;
  if (!host) return;
  host.cookie = `${name}=${encodeURIComponent(value)};path=/;max-age=${maxAgeSeconds};samesite=lax`;
}

/**
 * Reads a first-party preference cookie in the browser.
 *
 * Only the error boundary needs this: it renders on the client after a render
 * failure, so it cannot use the server-side locale resolution every other
 * surface uses, and it must still speak the visitor's language.
 */
export function readPreferenceCookie(name: string): string | null {
  const host = browser().document;
  if (!host) return null;
  for (const part of host.cookie.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

/** Reads a parameter out of the URL query string. */
export function readQueryParameter(name: string): string | null {
  const search = browser().location?.search ?? "";
  return new URLSearchParams(search).get(name);
}

/**
 * Re-applies the ARIA wiring the server used to render for auth errors.
 *
 * The auth pages are static assets now, so the error state is decided in the
 * browser; without this the message would be visible but unassociated with
 * the fields, and screen-reader users would lose the link between them.
 * `invalid` is false for a service outage: nothing is wrong with what the
 * customer typed, so the fields must not be marked as though there were.
 */
export function markFieldsInvalid(
  fieldIds: readonly string[],
  errorId: string,
  invalid: boolean,
) {
  const host = globalThis as unknown as {
    document?: {
      getElementById?: (id: string) => {
        setAttribute: (name: string, value: string) => void;
      } | null;
    };
  };
  for (const fieldId of fieldIds) {
    const field = host.document?.getElementById?.(fieldId);
    if (!field) continue;
    field.setAttribute("aria-describedby", errorId);
    if (invalid) field.setAttribute("aria-invalid", "true");
  }
}

/**
 * Reads a parameter out of the URL fragment.
 *
 * The fragment is never transmitted to the server, which is why the Supabase
 * recovery token arrives there and can only be read on the client.
 */
export function readFragmentParameter(name: string): string {
  const hash = browser().location?.hash ?? "";
  return new URLSearchParams(hash.replace(/^#/, "")).get(name) ?? "";
}
