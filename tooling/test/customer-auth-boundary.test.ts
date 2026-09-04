import { describe, expect, it, vi } from "vitest";
import { getCookie, requestId } from "../../apps/web/app/api/auth";
import { POST as signOut } from "../../apps/web/app/api/v1/auth/sign-out/route";
import { POST as refresh } from "../../apps/web/app/api/v1/auth/refresh/route";

describe("customer authentication boundary", () => {
  it("parses only the named HttpOnly session cookie", () => {
    const request = new Request("https://velyq.test/today", {
      headers: {
        cookie:
          "other=value; velyq_access_token=access-token; velyq_refresh_token=refresh-token",
      },
    });
    expect(getCookie(request, "velyq_access_token")).toBe("access-token");
    expect(getCookie(request, "missing")).toBeUndefined();
  });

  it("preserves a trusted request id and creates one when absent", () => {
    expect(
      requestId(
        new Request("https://velyq.test", {
          headers: { "x-request-id": "req-123" },
        }),
      ),
    ).toBe("req-123");
    expect(requestId(new Request("https://velyq.test"))).toMatch(
      /^[0-9a-f-]{36}$/,
    );
  });

  it("clears both server-side session cookies on sign-out", async () => {
    const response = await signOut(
      new Request("https://velyq.test/today", { method: "POST" }),
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://velyq.test/sign-in");
    const cookies = response.headers.getSetCookie();
    expect(cookies).toHaveLength(2);
    expect(cookies.join("\n")).toContain("velyq_access_token=;");
    expect(cookies.join("\n")).toContain("velyq_refresh_token=;");
    expect(cookies.every((cookie) => cookie.includes("Max-Age=0"))).toBe(true);
  });

  it("rejects refresh without a refresh cookie", async () => {
    const response = await refresh(
      new Request("https://velyq.test/api/v1/auth/refresh", {
        method: "POST",
        headers: { "x-request-id": "req-refresh-1" },
      }),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      code: "REFRESH_REQUIRED",
      requestId: "req-refresh-1",
    });
  });

  it("rotates both cookies after a successful provider refresh", async () => {
    const previousUrl = process.env["NEXT_PUBLIC_SUPABASE_URL"];
    const previousKey = process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
    process.env["NEXT_PUBLIC_SUPABASE_URL"] = "https://supabase.test";
    process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] = "publishable-test";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "new-access",
          refresh_token: "new-refresh",
          expires_in: 900,
        }),
        { status: 200 },
      ),
    );
    try {
      const response = await refresh(
        new Request("https://velyq.test/api/v1/auth/refresh", {
          method: "POST",
          headers: { cookie: "velyq_refresh_token=old-refresh" },
        }),
      );
      expect(response.status).toBe(200);
      expect(fetchMock).toHaveBeenCalledWith(
        "https://supabase.test/auth/v1/token?grant_type=refresh_token",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ refresh_token: "old-refresh" }),
        }),
      );
      const cookies = response.headers.getSetCookie().join("\n");
      expect(cookies).toContain("velyq_access_token=new-access");
      expect(cookies).toContain("velyq_refresh_token=new-refresh");
    } finally {
      fetchMock.mockRestore();
      if (previousUrl === undefined)
        delete process.env["NEXT_PUBLIC_SUPABASE_URL"];
      else process.env["NEXT_PUBLIC_SUPABASE_URL"] = previousUrl;
      if (previousKey === undefined)
        delete process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
      else process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] = previousKey;
    }
  });
});
