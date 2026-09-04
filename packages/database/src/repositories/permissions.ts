import { and, eq } from "drizzle-orm";
import {
  principalFromPermissionRows,
  type PermissionResolver,
  type Principal,
} from "@velyq/auth";
import type { PrivilegedVelyqDatabase } from "../client.js";
import {
  permissions,
  rolePermissions,
  roles,
  userRoles,
} from "../schema/private.js";

/** Resolves authorization from private relational state, never client claims. */
export class DatabasePermissionResolver implements PermissionResolver {
  constructor(private readonly database: PrivilegedVelyqDatabase) {}

  async resolve(userId: string): Promise<Principal | null> {
    const rows = await this.database
      .select({ roleCode: roles.code, permissionCode: permissions.code })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .innerJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(and(eq(userRoles.userId, userId)));
    if (rows.length === 0) return null;
    return principalFromPermissionRows(
      userId,
      rows.find((row) => row.roleCode === "ADMIN")?.roleCode ??
        rows[0]?.roleCode ??
        null,
      rows.map((row) => row.permissionCode),
    );
  }
}
