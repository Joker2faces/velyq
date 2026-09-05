import { describe, expect, it } from "vitest";
import {
  hasAdminPermission,
  hasPermission,
  principalFromPermissionRows,
} from "../src/index.js";
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
