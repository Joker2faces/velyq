import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { operationsSchema } from "./schemas.js";

export const providers = operationsSchema.table(
  "providers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    displayName: text("display_name").notNull(),
    isSynthetic: boolean("is_synthetic").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [unique("providers_code_unique").on(table.code)],
);

export const providerPolicyVersions = operationsSchema.table(
  "provider_policy_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "restrict" }),
    version: text("version").notNull(),
    policy: jsonb("policy").notNull(),
    effectiveFrom: timestamp("effective_from", {
      withTimezone: true,
    }).notNull(),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("provider_policy_versions_provider_id_version_unique").on(
      table.providerId,
      table.version,
    ),
    index("provider_policy_versions_provider_id_effective_from_idx").on(
      table.providerId,
      table.effectiveFrom.desc(),
    ),
  ],
);

export const providerSyncRuns = operationsSchema.table(
  "provider_sync_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "restrict" }),
    capability: text("capability").notNull(),
    status: text("status").notNull(),
    replaySequence: text("replay_sequence"),
    fixturePath: text("fixture_path"),
    contentHash: text("content_hash"),
    providerSchemaVersion: text("provider_schema_version").notNull(),
    normalizationVersion: text("normalization_version").notNull(),
    mappingVersion: text("mapping_version").notNull(),
    policyVersionId: uuid("policy_version_id")
      .notNull()
      .references(() => providerPolicyVersions.id, { onDelete: "restrict" }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    receivedCount: integer("received_count").notNull().default(0),
    acceptedCount: integer("accepted_count").notNull().default(0),
    rejectedCount: integer("rejected_count").notNull().default(0),
    errorSummary: jsonb("error_summary"),
  },
  (table) => [
    index("provider_sync_runs_provider_id_started_at_idx").on(
      table.providerId,
      table.startedAt.desc(),
    ),
    index("provider_sync_runs_status_started_at_idx").on(
      table.status,
      table.startedAt.desc(),
    ),
    index("provider_sync_runs_policy_version_id_idx").on(table.policyVersionId),
  ],
);

export const sourceObservations = operationsSchema.table(
  "source_observations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "restrict" }),
    syncRunId: uuid("sync_run_id")
      .notNull()
      .references(() => providerSyncRuns.id, { onDelete: "restrict" }),
    observationType: text("observation_type").notNull(),
    providerExternalId: text("provider_external_id").notNull(),
    providerObservedAt: timestamp("provider_observed_at", {
      withTimezone: true,
    }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    normalizedAt: timestamp("normalized_at", { withTimezone: true }).notNull(),
    normalizationVersion: text("normalization_version").notNull(),
    mappingVersion: text("mapping_version").notNull(),
    contentHash: text("content_hash").notNull(),
  },
  (table) => [
    unique("source_observations_provider_type_hash_unique").on(
      table.providerId,
      table.observationType,
      table.contentHash,
    ),
    index("source_observations_sync_run_id_idx").on(table.syncRunId),
    index("source_observations_provider_id_observed_at_idx").on(
      table.providerId,
      table.providerObservedAt.desc(),
    ),
  ],
);

export const jobs = operationsSchema.table(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: text("type").notNull(),
    contractVersion: text("contract_version").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    payload: jsonb("payload").notNull(),
    status: text("status").notNull(),
    attemptCount: integer("attempt_count").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull(),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull(),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    correlationId: uuid("correlation_id").notNull(),
    causationId: uuid("causation_id").notNull(),
    lastError: jsonb("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    unique("jobs_idempotency_key_unique").on(table.idempotencyKey),
    index("jobs_status_available_at_idx").on(table.status, table.availableAt),
    index("jobs_lease_expires_at_idx").on(table.leaseExpiresAt),
    index("jobs_correlation_id_idx").on(table.correlationId),
    check(
      "jobs_attempt_count_nonnegative_check",
      sql`${table.attemptCount} >= 0`,
    ),
    check("jobs_max_attempts_positive_check", sql`${table.maxAttempts} > 0`),
    check(
      "jobs_attempt_count_within_max_check",
      sql`${table.attemptCount} <= ${table.maxAttempts}`,
    ),
    check(
      "jobs_status_check",
      sql`${table.status} in ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED')`,
    ),
    check(
      "jobs_state_check",
      sql`(
        (${table.status} = 'PENDING' and ${table.leaseExpiresAt} is null and ${table.completedAt} is null)
        or (${table.status} = 'RUNNING' and ${table.leaseExpiresAt} is not null and ${table.startedAt} is not null and ${table.completedAt} is null)
        or (${table.status} = 'COMPLETED' and ${table.leaseExpiresAt} is null and ${table.startedAt} is not null and ${table.completedAt} is not null and ${table.lastError} is null)
        or (${table.status} = 'FAILED' and ${table.leaseExpiresAt} is null and ${table.startedAt} is not null and ${table.completedAt} is not null and ${table.lastError} is not null)
      )`,
    ),
  ],
);
