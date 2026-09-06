import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * sign-in, sign-up and forgot-password are credential-guessing / account-
 * enumeration / mail-bombing targets. These pin that a client hammering any
 * one of them past the policy gets 429s instead of unlimited attempts —
 * exercised through the actual route handlers, on a fake KV store standing
 * in for the Cloudflare binding this runtime doesn't have in tests.
 */

const kvState = vi.hoisted(() => ({ store: new Map<string, string>() }));

vi.mock("../app/rate-limit/rate-limit-source", () => ({
  resolveRateLimitStore: async () => ({
    get: async (key: string) => kvState.store.get(key) ?? null,
    put: async (key: string, value: string) => {
      kvState.store.set(key, value);
    },
  }),
}));

const ORIGIN = "https://velyq.test";
const IP = "203.0.113.9";

beforeEach(() => {
  kvState.store.clear();
  process.env["NEXT_PUBLIC_SUPABASE_URL"] = "https://project.supabase.co";
  process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] = "sb_publishable_test";
  process.env["VELYQ_APPLICATION_ORIGIN"] = ORIGIN;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{}", { status: 400 })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function post(path: string, body: unknown) {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: {
      origin: ORIGIN,
      "content-type": "application/json",
      "cf-connecting-ip": IP,
    },
    body: JSON.stringify(body),
  });
}

describe("auth endpoint rate limiting", () => {
  it("allows 6 sign-in attempts then blocks the 7th within the window", async () => {
    const { POST } = await import("../app/api/v1/auth/sign-in/route");
    let last: Response | undefined;
    for (let i = 0; i < 7; i += 1) {
      last = await POST(
        post("/api/v1/auth/sign-in", {
          email: "a@b.test",
          password: "wrong-password",
        }),
      );
    }
    expect(last!.status).toBe(429);
    expect(last!.headers.get("Retry-After")).toBeTruthy();
    const body = (await last!.json()) as Record<string, unknown>;
    expect(body["code"]).toBe("RATE_LIMITED");
  });

  it("isolates the limit per client IP", async () => {
    const { POST } = await import("../app/api/v1/auth/sign-in/route");
    for (let i = 0; i < 6; i += 1) {
      await POST(
        post("/api/v1/auth/sign-in", {
          email: "a@b.test",
          password: "wrong-password",
        }),
      );
    }
    const otherClient = new Request(`${ORIGIN}/api/v1/auth/sign-in`, {
      method: "POST",
      headers: {
        origin: ORIGIN,
        "content-type": "application/json",
        "cf-connecting-ip": "198.51.100.4",
      },
      body: JSON.stringify({ email: "a@b.test", password: "wrong-password" }),
    });
    const response = await POST(otherClient);
    expect(response.status).not.toBe(429);
  });

  it("limits sign-up independently of sign-in", async () => {
    const { POST: signIn } = await import("../app/api/v1/auth/sign-in/route");
    const { POST: signUp } = await import("../app/api/v1/auth/sign-up/route");
    for (let i = 0; i < 6; i += 1) {
      await signIn(
        post("/api/v1/auth/sign-in", {
          email: "a@b.test",
          password: "wrong-password",
        }),
      );
    }
    const response = await signUp(
      post("/api/v1/auth/sign-up", {
        email: "a@b.test",
        password: "a-long-enough-password",
      }),
    );
    expect(response.status).not.toBe(429);
  });

  it("limits forgot-password", async () => {
    const { POST } = await import("../app/api/v1/auth/forgot-password/route");
    let last: Response | undefined;
    for (let i = 0; i < 7; i += 1) {
      last = await POST(
        post("/api/v1/auth/forgot-password", { email: "a@b.test" }),
      );
    }
    expect(last!.status).toBe(429);
  });
});
