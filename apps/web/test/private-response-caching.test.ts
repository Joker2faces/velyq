import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every private customer response must forbid shared caching.
 *
 * Two distinct leaks, both real on this deployment rather than hygiene:
 *
 *   * A per-customer response with no `Cache-Control` behind a shared cache
 *     serves one customer's data to the next. `/api/v1/billing/projection`
 *     returned plan, subscription status, billing period and entitlements
 *     with no headers at all.
 *   * An entitlement-gated response with no `Cache-Control` is a paywall
 *     bypass: the cache stores the 200 served to an ELITE caller and answers a
 *     FREE caller from it, so `requireCustomerSession` never runs. Both
 *     `/api/v1/events/[eventId]/intelligence` and `.../odds-history` were
 *     open this way. Match data being shared rather than per-user does not
 *     help -- the gate, not the identity, is what leaks.
 *
 * This is not covered by a framework default. The deployed runtime is a
 * Cloudflare Worker built by Vinext, which does not read `next.config` (see
 * `apps/web/security-headers.ts`), and `proxy.ts` sets no cache headers -- so
 * nothing supplies a default and each route must say it.
 *
 * The check is structural rather than behavioural on purpose: a route added
 * without the header should fail here, at the point it is written, rather than
 * needing someone to think of writing a request-level test for it.
 */

const API_ROOT = join(import.meta.dirname, "..", "app", "api");

function routeFiles(directory: string): readonly string[] {
  const collected: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      collected.push(...routeFiles(path));
      continue;
    }
    if (entry === "route.ts") collected.push(path);
  }
  return collected;
}

/**
 * Routes that are public by design, with the reason.
 *
 * Deliberately an explicit allowlist rather than a pattern: adding a route
 * here is a decision someone has to write down.
 */
const PUBLIC_BY_DESIGN: Readonly<Record<string, string>> = {
  "health/route.ts": "liveness, deliberately non-sensitive",
  "ready/route.ts": "readiness, deliberately non-sensitive",
  "v1/auth/sign-in/route.ts": "unauthenticated by nature; sets its own cookie",
  "v1/auth/sign-up/route.ts": "unauthenticated by nature",
  "v1/auth/sign-out/route.ts": "clears the session cookie",
  "v1/auth/refresh/route.ts": "rotates the session cookie",
  "v1/auth/forgot-password/route.ts": "unauthenticated by nature",
  "v1/auth/reset-password/route.ts": "unauthenticated by nature",
  "v1/billing/webhook/route.ts": "server-to-server, Stripe signature",
  "internal/forecast-cycle/route.ts": "scheduler bearer, not a browser client",
  "internal/funnel-diagnostic/route.ts":
    "scheduler bearer, not a browser client",
};

describe("private customer responses forbid shared caching", () => {
  const files = routeFiles(API_ROOT);

  it("finds the customer API surface", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it("sets a no-store cache policy on every private route", () => {
    const offenders: string[] = [];
    for (const path of files) {
      const relative = path
        .slice(API_ROOT.length + 1)
        .split("\\")
        .join("/");
      if (relative in PUBLIC_BY_DESIGN) continue;
      const source = readFileSync(path, "utf8");
      /*
       * Either the shared constant or the literal policy. The constant is
       * preferred and is what the fixes use, but a route spelling it out is
       * not wrong -- only a route saying nothing is.
       */
      const declaresPolicy =
        source.includes("PRIVATE_RESPONSE_HEADERS") ||
        /["']cache-control["']\s*:\s*["']private,\s*no-store["']/.test(source);
      if (!declaresPolicy) offenders.push(relative);
    }
    expect(offenders).toEqual([]);
  });

  /*
   * The allowlist must not drift into naming routes that no longer exist,
   * because a stale entry silently exempts nothing while looking like it
   * exempts something -- and could later match a new route with that path.
   */
  it("keeps the public allowlist free of stale entries", () => {
    const present = new Set(
      files.map((path) =>
        path
          .slice(API_ROOT.length + 1)
          .split("\\")
          .join("/"),
      ),
    );
    const stale = Object.keys(PUBLIC_BY_DESIGN).filter(
      (entry) => !present.has(entry),
    );
    expect(stale).toEqual([]);
  });
});
