import { describe, expect, it } from "vitest";
import {
  hasCustomerEntitlement,
  resolveCustomerEntitlements,
} from "../../packages/auth/src/index";

describe("customer entitlements", () => {
  it("keeps free access useful without granting paid features", () => {
    const resolved = resolveCustomerEntitlements({
      plan: "FREE",
      status: null,
    });
    expect(resolved.plan).toBe("FREE");
    expect(hasCustomerEntitlement(resolved, "today.view")).toBe(true);
    expect(hasCustomerEntitlement(resolved, "edge.full")).toBe(false);
  });

  it("requires an authoritative active status for paid plans", () => {
    expect(
      resolveCustomerEntitlements({ plan: "PRO", status: "active" }).plan,
    ).toBe("PRO");
    expect(
      resolveCustomerEntitlements({ plan: "ELITE", status: "trialing" }).plan,
    ).toBe("ELITE");
    expect(
      resolveCustomerEntitlements({ plan: "PRO", status: "past_due" }).plan,
    ).toBe("FREE");
    expect(
      resolveCustomerEntitlements({ plan: "ELITE", status: "canceled" }).plan,
    ).toBe("FREE");
  });

  it("never includes admin permissions in customer entitlements", () => {
    const resolved = resolveCustomerEntitlements({
      plan: "ELITE",
      status: "active",
    });
    expect(resolved.entitlements.some((value) => value.includes("admin"))).toBe(
      false,
    );
  });
});
