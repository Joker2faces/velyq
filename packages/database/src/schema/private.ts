import {
  index,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { authUsers } from "./external.js";
import { privateSchema } from "./schemas.js";

export const roles = privateSchema.table(
  "roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [unique("roles_code_unique").on(table.code)],
);

export const permissions = privateSchema.table(
  "permissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [unique("permissions_code_unique").on(table.code)],
);

export const rolePermissions = privateSchema.table(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "restrict" }),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "role_permissions_pkey",
      columns: [table.roleId, table.permissionId],
    }),
    index("role_permissions_permission_id_idx").on(table.permissionId),
  ],
);

export const userRoles = privateSchema.table(
  "user_roles",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "restrict" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "restrict" }),
    grantedBy: uuid("granted_by")
      .notNull()
      .references(() => authUsers.id, { onDelete: "restrict" }),
    grantedAt: timestamp("granted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "user_roles_pkey",
      columns: [table.userId, table.roleId],
    }),
    index("user_roles_role_id_user_id_idx").on(table.roleId, table.userId),
    index("user_roles_granted_by_idx").on(table.grantedBy),
  ],
);
