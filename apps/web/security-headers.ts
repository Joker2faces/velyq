/**
 * The baseline security headers every response must carry.
 *
 * `next.config.js`'s `headers()` only takes effect on Next's own server
 * (Node/Vercel) — Vinext's Cloudflare build does not read or apply it, so the
 * deployed Worker was shipping every response with none of these headers at
 * all. Cloudflare is the platform this product actually runs on, so the
 * source of truth has to be something that runs on every request there:
 * `proxy.ts`, which both runtimes execute. `next.config.js` keeps its own
 * copy for the Node/Vercel path, generated from this list so the two never
 * drift apart.
 */
export const SECURITY_HEADERS: ReadonlyArray<readonly [string, string]> = [
  [
    "Content-Security-Policy",
    "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https:",
  ],
  ["Strict-Transport-Security", "max-age=31536000; includeSubDomains"],
  ["X-Content-Type-Options", "nosniff"],
  ["X-Frame-Options", "DENY"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
  ["Permissions-Policy", "camera=(), microphone=(), geolocation=()"],
];

export function applySecurityHeaders(response: Response): Response {
  for (const [key, value] of SECURITY_HEADERS) {
    if (!response.headers.has(key)) response.headers.set(key, value);
  }
  return response;
}
