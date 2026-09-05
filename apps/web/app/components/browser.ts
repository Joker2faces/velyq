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
type LocationHost = { hash: string };

function browser() {
  return globalThis as unknown as {
    document?: CookieHost;
    location?: LocationHost;
  };
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
 * Reads a parameter out of the URL fragment.
 *
 * The fragment is never transmitted to the server, which is why the Supabase
 * recovery token arrives there and can only be read on the client.
 */
export function readFragmentParameter(name: string): string {
  const hash = browser().location?.hash ?? "";
  return new URLSearchParams(hash.replace(/^#/, "")).get(name) ?? "";
}
