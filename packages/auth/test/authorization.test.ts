import { describe, expect, it } from "vitest";
import { hasPermission } from "../src/index.js";
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
});
