/**
 * The Node/Vercel side of the rate-limit source: there is no distributed
 * counter available there, so it always resolves to nothing. `check()`
 * treats that as "do not enforce" rather than "deny everything" — see
 * rate-limit.ts for why an unavailable limiter must fail open, not closed.
 */
export async function resolveRateLimitStore(): Promise<KVNamespace | null> {
  return null;
}
