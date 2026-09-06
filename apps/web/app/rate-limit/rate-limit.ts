/**
 * Fixed-window request limiting for abuse-sensitive routes, backed by
 * Workers KV.
 *
 * KV is not the ideal primitive here — it is eventually consistent across
 * Cloudflare's edge, so a client distributed across colos can exceed the
 * nominal limit for a short window before it converges. The correct
 * primitive (a Durable Object token bucket) requires the paid Workers plan,
 * and there is no Cloudflare zone attached to this Worker's workers.dev
 * subdomain to put a WAF rate-limiting rule on. This is the strongest no-cost
 * control available, and it still stops the actual common case — a single
 * client hammering sign-in — even though it is not airtight against a
 * distributed attacker.
 *
 * It fails open: if the store is absent (the Node/Vercel path has none) or
 * throws (a transient KV outage), requests are allowed rather than blocked.
 * An outage in the limiter must never become an outage of the product.
 */
export interface RateLimitPolicy {
  readonly limit: number;
  readonly windowSeconds: number;
}

export interface RateLimitResult {
  readonly allowed: boolean;
  readonly retryAfterSeconds: number;
}

const ALLOWED: RateLimitResult = { allowed: true, retryAfterSeconds: 0 };

export async function checkRateLimit(
  store: KVNamespace | null,
  key: string,
  policy: RateLimitPolicy,
): Promise<RateLimitResult> {
  if (!store) return ALLOWED;
  try {
    const raw = await store.get(key);
    const count = raw ? Number.parseInt(raw, 10) : 0;
    if (Number.isFinite(count) && count >= policy.limit) {
      return { allowed: false, retryAfterSeconds: policy.windowSeconds };
    }
    // The TTL is what makes this a *fixed-window* counter: it resets to 0
    // policy.windowSeconds after the first request in the window, without
    // needing a separate cleanup pass.
    await store.put(key, String(count + 1), {
      expirationTtl: policy.windowSeconds,
    });
    return ALLOWED;
  } catch {
    return ALLOWED;
  }
}

/**
 * The client identity a rate-limit key is built from. `cf-connecting-ip` is
 * set by Cloudflare's edge and cannot be spoofed by the client; it is absent
 * only outside Cloudflare (local dev, tests), where a fixed key is used so
 * the limiter still functions — coarsely — rather than throwing.
 */
export function clientIdentifier(request: Request): string {
  return request.headers.get("cf-connecting-ip") ?? "unknown";
}
