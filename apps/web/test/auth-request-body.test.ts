import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as signIn } from "../app/api/v1/auth/sign-in/route";
import { POST as signUp } from "../app/api/v1/auth/sign-up/route";
import { POST as forgotPassword } from "../app/api/v1/auth/forgot-password/route";
import { POST as resetPassword } from "../app/api/v1/auth/reset-password/route";

/*
 * These routes answer both a browser form post and a JSON API client — the
 * whole `browserForm` branch exists for that reason, and the JSON side returns
 * problem documents. But the body was read with `request.formData()`
 * unconditionally, and that throws a TypeError on `application/json`, so every
 * JSON caller got a 500 with no problem document at all. Observed live on the
 * Cloudflare Worker before this was fixed.
 *
 * The existing suite missed it because its `jsonRequest` helper sent
 * URLSearchParams — form-encoded under a JSON-sounding name — so no test ever
 * posted an actual JSON body.
 */

const ORIGIN = "https://velyq.test";

beforeEach(() => {
  process.env["NEXT_PUBLIC_SUPABASE_URL"] = "https://project.supabase.co";
  process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] = "sb_publishable_test";
  process.env["VELYQ_APPLICATION_ORIGIN"] = ORIGIN;
  // No network: every route should fail before or at the auth call, never on
  // body parsing.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{}", { status: 400 })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function jsonPost(path: string, body: unknown) {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function rawPost(path: string, body: string, contentType: string) {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": contentType },
    body,
  });
}

const routes = [
  [
    "sign-in",
    signIn,
    "/api/v1/auth/sign-in",
    { email: "a@b.test", password: "correct-horse" },
  ],
  [
    "sign-up",
    signUp,
    "/api/v1/auth/sign-up",
    { email: "a@b.test", password: "correct-horse" },
  ],
  [
    "forgot-password",
    forgotPassword,
    "/api/v1/auth/forgot-password",
    { email: "a@b.test" },
  ],
  [
    "reset-password",
    resetPassword,
    "/api/v1/auth/reset-password",
    { access_token: "token", password: "correct-horse" },
  ],
] as const;

describe("auth routes accept a JSON body", () => {
  it.each(routes)(
    "%s does not fail on application/json",
    async (_name, handler, path, fields) => {
      const response = await handler(jsonPost(path, fields));
      // Any considered answer is fine here; a 500 means the body threw.
      expect(response.status).not.toBe(500);
    },
  );

  it.each(routes)(
    "%s still accepts a form-encoded browser post",
    async (_name, handler, path, fields) => {
      const response = await handler(
        rawPost(
          path,
          new URLSearchParams(fields as Record<string, string>).toString(),
          "application/x-www-form-urlencoded",
        ),
      );
      expect(response.status).not.toBe(500);
    },
  );

  it.each(routes)(
    "%s rejects an unparseable body as a bad request, not a crash",
    async (_name, handler, path) => {
      const response = await handler(
        rawPost(path, "{not json at all", "application/json"),
      );
      expect(response.status).toBe(400);
    },
  );

  it("returns a problem document rather than an empty 500 for a JSON caller", async () => {
    const response = await signIn(
      jsonPost("/api/v1/auth/sign-in", { email: "", password: "" }),
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body["code"]).toBe("INVALID_REQUEST");
  });

  it("keeps rejecting a cross-site JSON post", async () => {
    const request = new Request(`${ORIGIN}/api/v1/auth/sign-in`, {
      method: "POST",
      headers: {
        origin: "https://attacker.example",
        "content-type": "application/json",
      },
      body: JSON.stringify({ email: "a@b.test", password: "correct-horse" }),
    });
    const response = await signIn(request);
    expect(response.status).toBe(403);
  });
});
