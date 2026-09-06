import { NextResponse } from "next/server";
import { resolveRateLimitStore } from "./rate-limit-source";
import {
  checkRateLimit,
  clientIdentifier,
  type RateLimitPolicy,
} from "./rate-limit";

export { clientIdentifier };

/**
 * Applies a rate-limit policy to `request` under `routeKey`, resolving
 * whichever store this runtime has (Cloudflare KV, or none on Node/Vercel).
 */
export async function enforceRateLimit(
  request: Request,
  routeKey: string,
  policy: RateLimitPolicy,
) {
  const store = await resolveRateLimitStore();
  return checkRateLimit(
    store,
    `${routeKey}:${clientIdentifier(request)}`,
    policy,
  );
}

/**
 * The 6-per-minute-per-client policy shared by the credential-guessing and
 * account-enumeration-sensitive auth routes. A legitimate user mistyping a
 * password a few times is unaffected; a scripted attempt loop is not.
 */
export const AUTH_RATE_LIMIT_POLICY: RateLimitPolicy = {
  limit: 6,
  windowSeconds: 60,
};

/**
 * Returns a 429 (or, for a browser form post, a redirect carrying the same
 * error the credential-failure path already uses) when `routeKey` is over
 * policy for this client; `null` when the request may proceed.
 */
export async function rateLimitedAuthResponse(
  request: Request,
  routeKey: string,
  redirectOnLimit: URL | null,
): Promise<Response | null> {
  const result = await enforceRateLimit(
    request,
    routeKey,
    AUTH_RATE_LIMIT_POLICY,
  );
  if (result.allowed) return null;
  if (redirectOnLimit) return NextResponse.redirect(redirectOnLimit);
  return NextResponse.json(
    {
      type: "https://velyq.dev/problems/rate-limited",
      title: "Too many attempts",
      status: 429,
      code: "RATE_LIMITED",
      requestId: crypto.randomUUID(),
    },
    {
      status: 429,
      headers: { "Retry-After": String(result.retryAfterSeconds) },
    },
  );
}
