import { describe, expect, it } from "vitest";
import { getCookie, requestId } from "../../apps/web/app/api/auth";
import { POST as signOut } from "../../apps/web/app/api/v1/auth/sign-out/route";

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
});
