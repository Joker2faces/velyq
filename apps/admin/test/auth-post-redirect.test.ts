import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as signIn } from "../app/api/v1/auth/sign-in/route";
import { POST as signOut } from "../app/api/v1/auth/sign-out/route";

const origin = "https://admin.rc.velyq.test";

beforeEach(() => {
  process.env["NEXT_PUBLIC_SUPABASE_URL"] = "https://supabase.test";
  process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] = "publishable-test";
  process.env["VELYQ_APPLICATION_ORIGIN"] = origin;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env["NEXT_PUBLIC_SUPABASE_URL"];
  delete process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
  delete process.env["VELYQ_APPLICATION_ORIGIN"];
});

describe("admin auth form Post/Redirect/Get semantics", () => {
  it("uses 303 and sets server-side cookies after successful sign-in", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          access_token: "admin-access-token",
          refresh_token: "admin-refresh-token",
          expires_in: 3600,
        }),
      ),
    );

    const response = await signIn(
      formPost("/api/v1/auth/sign-in", {
        email: "admin@example.test",
        password: "admin-password",
      }),
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${origin}/`);
    expect(response.headers.getSetCookie()).toHaveLength(2);
  });

  it("uses 303 and clears both cookies on sign-out", async () => {
    const response = await signOut(formPost("/api/v1/auth/sign-out", {}));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${origin}/`);
    expect(response.headers.getSetCookie()).toHaveLength(2);
  });
});

function formPost(path: string, fields: Record<string, string>) {
  return new Request(`${origin}${path}`, {
    method: "POST",
    headers: { origin, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields),
  });
}
