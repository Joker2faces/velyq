import { afterEach, describe, expect, it, vi } from "vitest";
import { requestId, requireCustomerSession } from "../../apps/web/app/api/auth";
import { customerService } from "../../apps/web/app/customer-runtime";
import { POST as customerSignOut } from "../../apps/web/app/api/v1/auth/sign-out/route";
import { POST as adminSignOut } from "../../apps/admin/app/api/v1/auth/sign-out/route";
import { adminRequestId } from "../../apps/admin/app/admin-api";

const originalEnvironment = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnvironment };
  vi.restoreAllMocks();
});

describe("security auth hardening", () => {
  it("fails closed when production customer authorization has no database", async () => {
    process.env["NODE_ENV"] = "production";
    delete process.env["VELYQ_DATABASE_URL"];
    delete process.env["VELYQ_SYNTHETIC_PREVIEW"];
    process.env["NEXT_PUBLIC_SUPABASE_URL"] = "https://supabase.test";
    process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] = "publishable-test";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "customer-1" }), { status: 200 }),
    );

    const denied = await requireCustomerSession(
      new Request("https://velyq.test/today", {
        headers: { cookie: "velyq_access_token=access-token" },
      }),
    );

    expect(denied?.status).toBe(503);
    expect(await denied?.json()).toMatchObject({
      code: "AUTHORIZATION_UNAVAILABLE",
    });
  });

  it("uses fixtures only outside production or in explicit preview mode", () => {
    delete process.env["VELYQ_DATABASE_URL"];
    process.env["NODE_ENV"] = "production";
    delete process.env["VELYQ_SYNTHETIC_PREVIEW"];
    expect(customerService()).toBeNull();

    process.env["VELYQ_SYNTHETIC_PREVIEW"] = "true";
    expect(customerService()).not.toBeNull();
  });

  it.each([
    ["customer", customerSignOut, "/sign-in"],
    ["admin", adminSignOut, "/"],
  ])(
    "revokes the %s Supabase session and clears cookies",
    async (_name, signOut, path) => {
      process.env["NEXT_PUBLIC_SUPABASE_URL"] = "https://supabase.test";
      process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] = "publishable-test";
      const fetchMock = vi
        .spyOn(globalThis, "fetch")
        .mockRejectedValue(new Error("provider unavailable"));

      const response = await signOut(
        new Request(`https://velyq.test${path}`, {
          method: "POST",
          headers: {
            cookie:
              "velyq_access_token=access-token; velyq_refresh_token=refresh-token",
          },
        }),
      );

      expect(fetchMock).toHaveBeenCalledWith(
        "https://supabase.test/auth/v1/logout",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            apikey: "publishable-test",
            Authorization: "Bearer access-token",
          }),
        }),
      );
      expect(response.status).toBe(307);
      const cookies = response.headers.getSetCookie();
      expect(cookies).toHaveLength(2);
      expect(cookies.every((cookie) => cookie.includes("Max-Age=0"))).toBe(
        true,
      );
    },
  );

  it("does not redirect production auth responses to an untrusted origin", async () => {
    process.env["NODE_ENV"] = "production";
    process.env["VELYQ_APPLICATION_ORIGIN"] = "https://app.velyq.test";
    delete process.env["NEXT_PUBLIC_SUPABASE_URL"];
    delete process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];

    const response = await customerSignOut(
      new Request("https://attacker.example/api/v1/auth/sign-out", {
        method: "POST",
      }),
    );

    expect(response.headers.get("location")).toBe(
      "https://app.velyq.test/sign-in",
    );
  });

  it("bounds and validates customer and admin request IDs", () => {
    const oversized = "a".repeat(1024);
    const unsafe = "request-id with spaces and <markup>";

    for (const value of [oversized, unsafe]) {
      const request = new Request("https://velyq.test", {
        headers: { "x-request-id": value },
      });
      expect(requestId(request)).toMatch(/^[0-9a-f-]{36}$/);
      expect(adminRequestId(request)).toMatch(/^[0-9a-f-]{36}$/);
    }
  });
});
