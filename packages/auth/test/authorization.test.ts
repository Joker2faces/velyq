import { describe, expect, it } from "vitest";
import {
  hasAdminPermission,
  hasEffectiveEntitlement,
  hasPermission,
  principalFromPermissionRows,
  resolveEffectiveCustomerAccess,
  type CustomerEntitlement,
  type Principal,
} from "../src/index.js";

const ALL_ENTITLEMENTS: readonly CustomerEntitlement[] = [
  "today.view",
  "edge.preview",
  "edge.full",
  "radar.preview",
  "radar.full",
  "match.detail",
];

const admin: Principal = {
  userId: "admin-1",
  role: "ADMIN",
  permissions: ["admin.access", "customer.read"],
};
const freeCustomer: Principal = {
  userId: "cust-1",
  role: "CUSTOMER",
  permissions: ["customer.read"],
};
describe("authorization", () => {
  it("denies anonymous and partial admin access", () => {
    expect(hasPermission(null, "customer.read")).toBe(false);
    expect(
      hasPermission(
        { userId: "u", role: "ADMIN", permissions: ["admin.access"] },
        "predictions.trace",
      ),
    ).toBe(false);
  });
  it("checks each permission independently", () => {
    expect(
      hasPermission(
        {
          userId: "u",
          role: "ADMIN",
          permissions: ["admin.access", "predictions.trace"],
        },
        "predictions.trace",
      ),
    ).toBe(true);
  });
  it("requires the canonical admin role and base permission", () => {
    expect(
      hasAdminPermission(
        {
          userId: "u",
          role: "CUSTOMER",
          permissions: ["admin.access", "predictions.trace"],
        },
        "predictions.trace",
      ),
    ).toBe(false);
    expect(
      hasAdminPermission(
        {
          userId: "u",
          role: "ADMIN",
          permissions: ["admin.access", "predictions.trace"],
        },
        "predictions.trace",
      ),
    ).toBe(true);
  });
  it("normalizes database permission rows", () => {
    expect(
      principalFromPermissionRows("user-1", "ADMIN", [
        "admin.access",
        "admin.access",
        "unknown",
      ]),
    ).toEqual({
      userId: "user-1",
      role: "ADMIN",
      permissions: ["admin.access"],
    });
  });
});

describe("resolveEffectiveCustomerAccess", () => {
  /*
   * The bug this guards: every caller used to resolve entitlements from
   * `{ plan, status }` alone, discarding the principal it had already
   * fetched. An ADMIN with no paid subscription was resolved to FREE and
   * gated exactly like any unpaid visitor — `match.detail`, `edge.full` and
   * `radar.full` all fell behind a paywall for the one account that exists
   * to inspect the product without buying it.
   */
  it("grants every customer entitlement to an admin with no subscription", () => {
    const access = resolveEffectiveCustomerAccess(
      { plan: "FREE", status: null },
      admin,
    );
    expect(access.entitlements).toEqual(
      expect.arrayContaining(ALL_ENTITLEMENTS),
    );
    for (const entitlement of ALL_ENTITLEMENTS) {
      expect(hasEffectiveEntitlement(access, entitlement)).toBe(true);
    }
  });

  it("never inflates the admin's displayed plan or subscription status", () => {
    /*
     * The architecture this must not violate: subscription plan and admin
     * permission are independent. Widening entitlements must never rewrite
     * `plan` to ELITE or invent a subscription status — an admin account
     * with no subscription must keep reporting exactly that.
     */
    const access = resolveEffectiveCustomerAccess(
      { plan: "FREE", status: null },
      admin,
    );
    expect(access.plan).toBe("FREE");
    expect(access.subscriptionStatus).toBeNull();
    expect(access.internalAccess).toBe(true);
  });

  it("denies match.detail to a FREE non-admin", () => {
    const access = resolveEffectiveCustomerAccess(
      { plan: "FREE", status: null },
      freeCustomer,
    );
    expect(hasEffectiveEntitlement(access, "match.detail")).toBe(false);
    expect(access.internalAccess).toBe(false);
  });

  it("follows ordinary PRO entitlements for a non-admin PRO customer", () => {
    const proCustomer: Principal = {
      userId: "cust-2",
      role: "CUSTOMER",
      permissions: ["customer.read"],
    };
    const access = resolveEffectiveCustomerAccess(
      { plan: "PRO", status: "active" },
      proCustomer,
    );
    expect(hasEffectiveEntitlement(access, "edge.full")).toBe(true);
    expect(hasEffectiveEntitlement(access, "radar.full")).toBe(true);
    expect(hasEffectiveEntitlement(access, "match.detail")).toBe(false);
    expect(access.internalAccess).toBe(false);
  });

  it("follows ordinary ELITE entitlements for a non-admin ELITE customer, without admin.access", () => {
    const eliteCustomer: Principal = {
      userId: "cust-3",
      role: "CUSTOMER",
      permissions: ["customer.read"],
    };
    const access = resolveEffectiveCustomerAccess(
      { plan: "ELITE", status: "active" },
      eliteCustomer,
    );
    expect(hasEffectiveEntitlement(access, "match.detail")).toBe(true);
    /* ELITE never implies admin.access: a paid tier is not an
       authorization role, and this is the assertion that keeps it that
       way. */
    expect(access.internalAccess).toBe(false);
    expect(hasPermission(eliteCustomer, "admin.access")).toBe(false);
  });

  it("requires both the ADMIN role and the admin.access permission", () => {
    /* A CUSTOMER row that somehow carries the admin.access permission code
       must not be treated as internal access — the role check and the
       permission check are both load-bearing, not redundant. */
    const misconfigured: Principal = {
      userId: "u",
      role: "CUSTOMER",
      permissions: ["admin.access", "customer.read"],
    };
    const access = resolveEffectiveCustomerAccess(
      { plan: "FREE", status: null },
      misconfigured,
    );
    expect(access.internalAccess).toBe(false);
    expect(hasEffectiveEntitlement(access, "match.detail")).toBe(false);
  });

  it("treats a null principal as an ordinary unauthenticated resolution", () => {
    const access = resolveEffectiveCustomerAccess(
      { plan: "FREE", status: null },
      null,
    );
    expect(access.internalAccess).toBe(false);
    expect(hasEffectiveEntitlement(access, "match.detail")).toBe(false);
  });
});
