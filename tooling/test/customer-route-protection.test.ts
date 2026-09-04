import { describe, expect, it } from "vitest";
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

  it("redirects anonymous protected routes to sign-in", () => {
    const response = proxy(request());
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://velyq.test/sign-in");
  });

  it("passes a session-bearing request through the proxy", () => {
    const response = proxy(request("opaque-session"));
    expect(response.status).toBe(200);
  });

  it("keeps every customer scenario reachable by its event id", () => {
    expect(customerToday.matches).toHaveLength(7);
    for (const match of customerToday.matches)
      expect(findCustomerMatch(match.eventId)).toEqual(match);
  });
});
