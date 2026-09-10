import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hasAdminPermission, hasPermission } from "@velyq/auth";
import type { Principal } from "@velyq/auth";

/**
 * Admin pages and admin APIs must authorize identically.
 *
 * `getAdminContext` used `hasPermission`, which checks only that a permission
 * code is present on the principal. The admin APIs use `hasAdminPermission`,
 * which additionally requires role ADMIN and `admin.access`. So granting a
 * fine-grained code such as `audit.read` to a non-admin role -- a plausible
 * read-only-analyst configuration, and nothing in the schema forbids it,
 * since `private.role_permissions` is operational data with no committed seed
 * -- let that user render the full audit page, including the actor of every
 * admin action, while the API serving the same data answered 403.
 *
 * The rendered page was the weaker door to identical data. Both now resolve
 * through the same function.
 */

const ADMIN_PAGE_SOURCE = readFileSync(
  join(import.meta.dirname, "..", "app", "admin-page.tsx"),
  "utf8",
);

function principal(overrides: Partial<Principal> = {}): Principal {
  return {
    userId: "00000000-0000-4000-8000-000000000001",
    email: "analyst@example.com",
    role: "CUSTOMER",
    permissions: ["audit.read"],
    ...overrides,
  } as Principal;
}

describe("admin page authorization", () => {
  it("gates pages with hasAdminPermission, not hasPermission", () => {
    expect(ADMIN_PAGE_SOURCE).toContain(
      "hasAdminPermission(authentication.principal, permission)",
    );
    /*
     * Asserted as an absence too: re-importing the weaker check is how this
     * would come back, and it would still typecheck and still render.
     */
    expect(ADMIN_PAGE_SOURCE).not.toMatch(
      /\bhasPermission\(authentication\.principal/,
    );
  });

  /*
   * The exact configuration that was exploitable: the permission is present,
   * so the weak check passes, but the principal is not an administrator.
   */
  it("refuses a non-admin holding a fine-grained admin permission", () => {
    const analyst = principal();
    expect(hasPermission(analyst, "audit.read")).toBe(true);
    expect(hasAdminPermission(analyst, "audit.read")).toBe(false);
  });

  it("refuses an ADMIN role that has not been granted admin.access", () => {
    const partial = principal({ role: "ADMIN", permissions: ["audit.read"] });
    expect(hasAdminPermission(partial, "audit.read")).toBe(false);
  });

  it("admits a real administrator", () => {
    const admin = principal({
      role: "ADMIN",
      permissions: ["admin.access", "audit.read"],
    });
    expect(hasAdminPermission(admin, "audit.read")).toBe(true);
  });

  it("refuses an administrator lacking the specific permission", () => {
    const admin = principal({
      role: "ADMIN",
      permissions: ["admin.access"],
    });
    expect(hasAdminPermission(admin, "audit.read")).toBe(false);
  });
});
