/**
 * Returns the explicitly configured admin origin.
 *
 * There is intentionally no staging fallback: an unset or invalid value
 * removes the link instead of sending customers to an unverified host.
 *
 * The environment variable is read as a literal `process.env["NEXT_PUBLIC_…"]`
 * expression rather than through an indirection constant on purpose: Next.js
 * inlines `NEXT_PUBLIC_*` values into the client bundle by statically
 * pattern-matching that exact literal key at build time (a literal dot or
 * bracket-string form both work; a bracket access through a variable does
 * not). This previously read the key through a separately-declared string
 * constant — an *indexed* `process.env[thatConstant]` access — which the
 * compiler cannot resolve to a specific key, so nothing was ever inlined and
 * every client bundle read an always-empty `process.env` at runtime. Every
 * visitor, admin or not, in every environment, has therefore always seen
 * this function return `null` and the admin console link never render —
 * this is the actual root cause of the broken admin entry the owner
 * reported.
 */
export function getConfiguredAdminUrl() {
  const configured = process.env["NEXT_PUBLIC_VELYQ_ADMIN_URL"]?.trim();
  if (!configured) return null;

  try {
    const url = new URL(configured);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (
      process.env["NODE_ENV"] === "production" &&
      url.hostname.endsWith(".vercel.app") &&
      (url.hostname.includes("-git-") ||
        /-[a-z0-9]{8,}-joker2faces-projects\.vercel\.app$/i.test(url.hostname))
    )
      return null;
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}
