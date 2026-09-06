import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Cloudflare Free has no zone to attach a WAF rate-limiting rule to (this
 * Worker serves its own workers.dev subdomain), and Durable Objects — the
 * correct distributed counter primitive — require the paid Workers plan. KV
 * is what is left, and it is only eventually consistent across the edge:
 * a determined attacker distributed across many Cloudflare colos can exceed
 * the nominal limit for a short window. That is the trade this makes, and it
 * is still real protection against the actual threat (a single client
 * hammering one endpoint), not a false sense of one — see rate-limit.ts.
 */

const kvState = vi.hoisted(() => ({
  store: new Map<string, { value: string; expiresAt: number }>(),
}));

function fakeKv(): KVNamespace {
  return {
    get: async (key: string) => {
      const entry = kvState.store.get(key);
      if (!entry) return null;
      if (entry.expiresAt < Date.now()) {
        kvState.store.delete(key);
        return null;
      }
      return entry.value;
    },
    put: async (
      key: string,
      value: string,
      opts?: { expirationTtl?: number },
    ) => {
      kvState.store.set(key, {
        value,
        expiresAt: Date.now() + (opts?.expirationTtl ?? 60) * 1000,
      });
    },
  } as unknown as KVNamespace;
}

beforeEach(() => {
  kvState.store.clear();
});

describe("rate limiting", () => {
  it("allows requests under the limit", async () => {
    const { checkRateLimit } = await import("../app/rate-limit/rate-limit");
    const kv = fakeKv();
    for (let i = 0; i < 5; i += 1) {
      const result = await checkRateLimit(kv, "sign-in:1.2.3.4", {
        limit: 5,
        windowSeconds: 60,
      });
      expect(result.allowed).toBe(true);
    }
  });

  it("denies once the limit is exceeded within the window", async () => {
    const { checkRateLimit } = await import("../app/rate-limit/rate-limit");
    const kv = fakeKv();
    for (let i = 0; i < 5; i += 1) {
      await checkRateLimit(kv, "sign-in:1.2.3.4", {
        limit: 5,
        windowSeconds: 60,
      });
    }
    const result = await checkRateLimit(kv, "sign-in:1.2.3.4", {
      limit: 5,
      windowSeconds: 60,
    });
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("keys are isolated per route and per client", async () => {
    const { checkRateLimit } = await import("../app/rate-limit/rate-limit");
    const kv = fakeKv();
    for (let i = 0; i < 5; i += 1) {
      await checkRateLimit(kv, "sign-in:1.2.3.4", {
        limit: 5,
        windowSeconds: 60,
      });
    }
    // A different client on the same route is unaffected.
    const otherClient = await checkRateLimit(kv, "sign-in:9.9.9.9", {
      limit: 5,
      windowSeconds: 60,
    });
    expect(otherClient.allowed).toBe(true);
    // The same client on a different route is unaffected.
    const otherRoute = await checkRateLimit(kv, "sign-up:1.2.3.4", {
      limit: 5,
      windowSeconds: 60,
    });
    expect(otherRoute.allowed).toBe(true);
  });

  it("fails open when no store is available, rather than blocking everyone", async () => {
    const { checkRateLimit } = await import("../app/rate-limit/rate-limit");
    /*
     * An outage in the limiter itself must never become an outage of the
     * product. KV being briefly unavailable, or the binding being absent
     * (the Node/Vercel path), degrades to "not enforced", not "deny all".
     */
    const result = await checkRateLimit(null, "sign-in:1.2.3.4", {
      limit: 5,
      windowSeconds: 60,
    });
    expect(result.allowed).toBe(true);
  });

  it("fails open when the store throws", async () => {
    const { checkRateLimit } = await import("../app/rate-limit/rate-limit");
    const broken = {
      get: async () => {
        throw new Error("KV unavailable");
      },
      put: async () => {
        throw new Error("KV unavailable");
      },
    } as unknown as KVNamespace;
    const result = await checkRateLimit(broken, "sign-in:1.2.3.4", {
      limit: 1,
      windowSeconds: 60,
    });
    expect(result.allowed).toBe(true);
  });

  it("resets after the window elapses", async () => {
    const { checkRateLimit } = await import("../app/rate-limit/rate-limit");
    const kv = fakeKv();
    for (let i = 0; i < 3; i += 1) {
      await checkRateLimit(kv, "sign-in:1.2.3.4", {
        limit: 3,
        windowSeconds: 1,
      });
    }
    const blocked = await checkRateLimit(kv, "sign-in:1.2.3.4", {
      limit: 3,
      windowSeconds: 1,
    });
    expect(blocked.allowed).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 1100));
    const afterWindow = await checkRateLimit(kv, "sign-in:1.2.3.4", {
      limit: 3,
      windowSeconds: 1,
    });
    expect(afterWindow.allowed).toBe(true);
  });
});

describe("clientIdentifier", () => {
  it("prefers the Cloudflare connecting-IP header", async () => {
    const { clientIdentifier } = await import("../app/rate-limit/rate-limit");
    const request = new Request("https://velyq.test/api/v1/auth/sign-in", {
      headers: { "cf-connecting-ip": "203.0.113.7" },
    });
    expect(clientIdentifier(request)).toBe("203.0.113.7");
  });

  it("falls back to a fixed key when no client IP is available, rather than throwing", async () => {
    const { clientIdentifier } = await import("../app/rate-limit/rate-limit");
    const request = new Request("https://velyq.test/api/v1/auth/sign-in");
    expect(typeof clientIdentifier(request)).toBe("string");
    expect(clientIdentifier(request).length).toBeGreaterThan(0);
  });
});
