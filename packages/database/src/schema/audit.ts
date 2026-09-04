import { index, jsonb, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { authUsers } from "./external.js";
import { auditSchema } from "./schemas.js";

export const adminAuditEvents = auditSchema.table(
  "admin_audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "restrict" }),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id").notNull(),
    reason: text("reason"),
    beforeState: jsonb("before_state"),
    afterState: jsonb("after_state"),
    requestId: uuid("request_id").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("admin_audit_events_actor_occurred_at_idx").on(
      table.actorUserId,
      table.occurredAt.desc(),
    ),
    index("admin_audit_events_resource_occurred_at_idx").on(
      table.resourceType,
      table.resourceId,
      table.occurredAt.desc(),
    ),
    index("admin_audit_events_request_id_idx").on(table.requestId),
  ],
);
