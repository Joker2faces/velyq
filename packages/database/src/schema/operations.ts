import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  text,
  primaryKey,
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
    normalizedOutputHash: text("normalized_output_hash"),
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
    unique("provider_sync_runs_replay_identity_unique").on(
      table.providerId,
      table.replaySequence,
      table.startedAt,
    ),
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
    leaseOwner: text("lease_owner"),
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
        (${table.status} = 'PENDING' and ${table.leaseExpiresAt} is null and ${table.leaseOwner} is null and ${table.completedAt} is null)
        or (${table.status} = 'RUNNING' and ${table.leaseExpiresAt} is not null and ${table.leaseOwner} is not null and ${table.startedAt} is not null and ${table.completedAt} is null)
        or (${table.status} = 'COMPLETED' and ${table.leaseExpiresAt} is null and ${table.leaseOwner} is null and ${table.startedAt} is not null and ${table.completedAt} is not null and ${table.lastError} is null)
        or (${table.status} = 'FAILED' and ${table.leaseExpiresAt} is null and ${table.leaseOwner} is null and ${table.startedAt} is not null and ${table.completedAt} is not null and ${table.lastError} is not null)
      )`,
    ),
  ],
);

/**
 * Remembered provider quota, one row per (provider, UTC quota day).
 *
 * The remaining count arrives only in provider response headers, so without
 * this table a stateless invocation cannot know its own budget without
 * spending a request to ask -- and on a ~100-request day, asking on every
 * scheduler wake-up would consume a meaningful fraction of the budget.
 *
 * `dailyLimit` and `remaining` are nullable because the provider does not
 * always report them, and inventing a number would be worse than admitting
 * it is unknown: the quota policy treats null as UNKNOWN, which is
 * deliberately distinct from EXHAUSTED.
 */
export const providerQuotaState = operationsSchema.table(
  "provider_quota_state",
  {
    providerId: uuid("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "restrict" }),
    /* Part of the key rather than a column something has to reset: quota
       resets at UTC midnight, so a new day is simply a new row. */
    quotaDay: date("quota_day").notNull(),
    dailyLimit: integer("daily_limit"),
    remaining: integer("remaining"),
    requestsUsed: integer("requests_used").notNull().default(0),
    /* Per-purpose spend, incremented in the same write as `remaining` so
       budget accounting never depends on an invocation surviving to write a
       run record. */
    discoveryRequests: integer("discovery_requests").notNull().default(0),
    oddsRequests: integer("odds_requests").notNull().default(0),
    lineupRequests: integer("lineup_requests").notNull().default(0),
    resultRequests: integer("result_requests").notNull().default(0),
    lastObservedAt: timestamp("last_observed_at", { withTimezone: true }),
    lastProviderCallAt: timestamp("last_provider_call_at", {
      withTimezone: true,
    }),
    policyState: text("policy_state").notNull(),
    policyVersion: text("policy_version").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "provider_quota_state_pkey",
      columns: [table.providerId, table.quotaDay],
    }),
    check(
      "provider_quota_state_policy_state_check",
      sql`${table.policyState} in ('HEALTHY', 'CONSERVE', 'CRITICAL', 'EXHAUSTED', 'UNKNOWN')`,
    ),
    check(
      "provider_quota_state_remaining_check",
      sql`${table.remaining} is null or ${table.remaining} >= 0`,
    ),
    check(
      "provider_quota_state_daily_limit_check",
      sql`${table.dailyLimit} is null or ${table.dailyLimit} > 0`,
    ),
    check(
      "provider_quota_state_requests_used_check",
      sql`${table.requestsUsed} >= 0`,
    ),
    check(
      "provider_quota_state_purpose_counters_check",
      sql`${table.discoveryRequests} >= 0 and ${table.oddsRequests} >= 0 and ${table.lineupRequests} >= 0 and ${table.resultRequests} >= 0`,
    ),
  ],
);

/**
 * One row per live provider ingestion pass.
 *
 * Separate from `providerSyncRuns`, which is shaped for deterministic replay
 * (`replaySequence`, `contentHash`, a mandatory policy version, and a
 * uniqueness rule over provider/sequence/start) -- none of which describes a
 * live poll that may legitimately make zero provider requests. Overloading
 * that table would blur replay provenance with live operations.
 *
 * `providerCallsUsed` of zero is the expected value for a wake-up with no
 * work due, not a failure.
 */
export const providerIngestionRuns = operationsSchema.table(
  "provider_ingestion_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "restrict" }),
    trigger: text("trigger").notNull(),
    quotaDay: date("quota_day").notNull(),
    quotaPolicyVersion: text("quota_policy_version").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    status: text("status").notNull(),
    providerCallsUsed: integer("provider_calls_used").notNull().default(0),
    quotaStateAtStart: text("quota_state_at_start"),
    quotaStateAtEnd: text("quota_state_at_end"),
    quotaRemainingAtEnd: integer("quota_remaining_at_end"),
    discoveryDatesRequested: text("discovery_dates_requested")
      .array()
      .notNull()
      .default(sql`'{}'`),
    fixturesReceived: integer("fixtures_received").notNull().default(0),
    fixturesWritten: integer("fixtures_written").notNull().default(0),
    oddsCandidates: integer("odds_candidates").notNull().default(0),
    oddsRequestsAttempted: integer("odds_requests_attempted")
      .notNull()
      .default(0),
    oddsObservationsReceived: integer("odds_observations_received")
      .notNull()
      .default(0),
    oddsObservationsWritten: integer("odds_observations_written")
      .notNull()
      .default(0),
    oddsDuplicates: integer("odds_duplicates").notNull().default(0),
    lineupCandidates: integer("lineup_candidates").notNull().default(0),
    lineupRequestsAttempted: integer("lineup_requests_attempted")
      .notNull()
      .default(0),
    lineupsReceived: integer("lineups_received").notNull().default(0),
    lineupsWritten: integer("lineups_written").notNull().default(0),
    lineupDuplicates: integer("lineup_duplicates").notNull().default(0),
    lineupsOfficial: integer("lineups_official").notNull().default(0),
    resultCandidates: integer("result_candidates").notNull().default(0),
    resultRequestsAttempted: integer("result_requests_attempted")
      .notNull()
      .default(0),
    resultsReceived: integer("results_received").notNull().default(0),
    resultsWritten: integer("results_written").notNull().default(0),
    resultDuplicates: integer("result_duplicates").notNull().default(0),
    settlementsWritten: integer("settlements_written").notNull().default(0),
    skippedByReason: jsonb("skipped_by_reason")
      .notNull()
      .default(sql`'{}'::jsonb`),
    errorsByReason: jsonb("errors_by_reason")
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("provider_ingestion_runs_provider_started_idx").on(
      table.providerId,
      table.startedAt.desc(),
    ),
    index("provider_ingestion_runs_quota_day_idx").on(
      table.quotaDay,
      table.startedAt.desc(),
    ),
    check(
      "provider_ingestion_runs_trigger_check",
      sql`${table.trigger} in ('SCHEDULER', 'MANUAL')`,
    ),
    check(
      "provider_ingestion_runs_status_check",
      sql`${table.status} in ('RUNNING', 'COMPLETED', 'FAILED')`,
    ),
    check(
      "provider_ingestion_runs_calls_check",
      sql`${table.providerCallsUsed} >= 0`,
    ),
  ],
);

/**
 * When we last asked the provider about a fixture's odds.
 *
 * Deliberately separate from both odds timestamps. The provider's
 * `providerObservedAt` is its own `update` time and is frequently hours old,
 * so scheduling on it makes a fixture permanently due; `receivedAt` only
 * advances when a row is actually inserted, and a re-request returning
 * unchanged prices inserts nothing. Either way the marker meant to stop the
 * loop could not advance, and live runs re-bought the same fixture on seven
 * consecutive passes.
 *
 * Asking is an operational fact, recorded on its own terms.
 */
export const providerOddsRequests = operationsSchema.table(
  "provider_odds_requests",
  {
    providerId: uuid("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "restrict" }),
    /* The provider's own reference, so this is written straight after the
       call without first resolving an internal event id. */
    providerFixtureId: text("provider_fixture_id").notNull(),
    lastRequestedAt: timestamp("last_requested_at", {
      withTimezone: true,
    }).notNull(),
    requestCount: integer("request_count").notNull().default(1),
  },
  (table) => [
    primaryKey({
      name: "provider_odds_requests_pkey",
      columns: [table.providerId, table.providerFixtureId],
    }),
    index("provider_odds_requests_last_requested_idx").on(
      table.providerId,
      table.lastRequestedAt.desc(),
    ),
    check("provider_odds_requests_count_check", sql`${table.requestCount} > 0`),
  ],
);

/**
 * When we last asked the provider about a fixture's result.
 *
 * The same marker discipline as `provider_odds_requests`, and for the same
 * reason: the only timestamp that correctly gates spending another request is
 * the one that advances when *we* act. Scheduling on the provider's own
 * observation instant instead is what made the odds pass re-buy identical
 * prices on four consecutive runs.
 *
 * `lastKnownStatus` is cached here rather than re-derived from
 * `intelligence.event_results` on every pass. That is deliberate: a fixture
 * the provider refused, or one whose event identity we could not resolve, has
 * no `event_results` row at all, so a status read from there alone cannot
 * distinguish "not finished" from "we asked and could not use the answer" --
 * and the second case must not re-ask every fifteen minutes.
 */
export const providerResultRequests = operationsSchema.table(
  "provider_result_requests",
  {
    providerId: uuid("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "restrict" }),
    providerFixtureId: text("provider_fixture_id").notNull(),
    lastRequestedAt: timestamp("last_requested_at", {
      withTimezone: true,
    }).notNull(),
    requestCount: integer("request_count").notNull().default(1),
    /** The lifecycle state the provider last reported, if it reported one. */
    lastKnownStatus: text("last_known_status"),
  },
  (table) => [
    primaryKey({
      name: "provider_result_requests_pkey",
      columns: [table.providerId, table.providerFixtureId],
    }),
    index("provider_result_requests_last_requested_idx").on(
      table.providerId,
      table.lastRequestedAt.desc(),
    ),
    check(
      "provider_result_requests_count_check",
      sql`${table.requestCount} > 0`,
    ),
    check(
      "provider_result_requests_status_check",
      sql`${table.lastKnownStatus} is null or ${table.lastKnownStatus} in
          ('SCHEDULED', 'IN_PROGRESS', 'FINAL', 'POSTPONED', 'CANCELLED', 'ABANDONED')`,
    ),
  ],
);

/**
 * When we last asked the provider about a fixture's lineup.
 *
 * The third marker table, and for the third time the same reason: the only
 * timestamp that correctly gates spending another request is the one that
 * advances when *we* act.
 *
 * `lastKnownStatus` matters more here than for results, because the terminal
 * state is narrower. Only OFFICIAL ends a fixture's cost; EXPECTED and
 * UNAVAILABLE both mean keep asking, since a provisional sheet is exactly
 * what must be replaced and is also the state in which `WAIT_FOR_LINEUP`
 * stays closed.
 */
export const providerLineupRequests = operationsSchema.table(
  "provider_lineup_requests",
  {
    providerId: uuid("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "restrict" }),
    providerFixtureId: text("provider_fixture_id").notNull(),
    lastRequestedAt: timestamp("last_requested_at", {
      withTimezone: true,
    }).notNull(),
    requestCount: integer("request_count").notNull().default(1),
    /** The best lineup state the provider has reported, if any. */
    lastKnownStatus: text("last_known_status"),
  },
  (table) => [
    primaryKey({
      name: "provider_lineup_requests_pkey",
      columns: [table.providerId, table.providerFixtureId],
    }),
    index("provider_lineup_requests_last_requested_idx").on(
      table.providerId,
      table.lastRequestedAt.desc(),
    ),
    check(
      "provider_lineup_requests_count_check",
      sql`${table.requestCount} > 0`,
    ),
    check(
      "provider_lineup_requests_status_check",
      sql`${table.lastKnownStatus} is null or ${table.lastKnownStatus} in
          ('EXPECTED', 'OFFICIAL', 'UNAVAILABLE')`,
    ),
  ],
);
