import { describe, expect, it, vi } from "vitest";
import { proxy } from "../../apps/web/proxy.ts";
import {
  customerToday,
  findCustomerMatch,
} from "../../apps/web/app/customer-data.ts";

describe("customer route protection and scenario reachability", () => {
  const request = (cookie?: string) =>
    ({
      url: "https://velyq.test/today",
      cookies: { get: () => (cookie ? { value: cookie } : undefined) },
    }) as never;

  it("redirects anonymous protected routes to sign-in", async () => {
    const response = await proxy(request());
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://velyq.test/sign-in");
  });

  it("passes only a provider-validated session through the proxy", async () => {
    const previousUrl = process.env["NEXT_PUBLIC_SUPABASE_URL"];
    const previousKey = process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
    process.env["NEXT_PUBLIC_SUPABASE_URL"] = "https://supabase.test";
    process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] = "publishable-test";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));
    try {
      const response = await proxy(request("opaque-session"));
      expect(response.status).toBe(200);
      expect(fetchMock).toHaveBeenCalledWith(
        "https://supabase.test/auth/v1/user",
        expect.objectContaining({
          headers: {
            apikey: "publishable-test",
            Authorization: "Bearer opaque-session",
          },
        }),
      );
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

  it("keeps every customer scenario reachable by its event id", () => {
    expect(customerToday.matches).toHaveLength(7);
    for (const match of customerToday.matches)
      expect(findCustomerMatch(match.eventId)).toEqual(match);
  });
});
