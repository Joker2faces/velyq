BEGIN;
SELECT plan(11);

SELECT ok(
  (
    SELECT is_nullable = 'NO'
    FROM information_schema.columns
    WHERE table_schema = 'operations'
      AND table_name = 'jobs'
      AND column_name = 'causation_id'
  ),
  'every job has a non-null causation identifier'
);

SELECT throws_ok(
  $$
    INSERT INTO operations.jobs (
      id, type, contract_version, idempotency_key, payload, status,
      attempt_count, max_attempts, available_at, correlation_id, causation_id, created_at
    ) VALUES (
      '70000000-0000-4000-8000-000000000201', 'TEST.v1', 'v1', 'job-negative-attempt', '{}'::jsonb, 'PENDING',
      -1, 3, '2026-09-03T12:00:00Z', '70000000-0000-4000-8000-000000000291', '70000000-0000-4000-8000-000000000292', '2026-09-03T12:00:00Z'
    )
  $$,
  '23514',
  NULL,
  'attempt_count cannot be negative'
);

SELECT throws_ok(
  $$
    INSERT INTO operations.jobs (
      id, type, contract_version, idempotency_key, payload, status,
      attempt_count, max_attempts, available_at, correlation_id, causation_id, created_at
    ) VALUES (
      '70000000-0000-4000-8000-000000000202', 'TEST.v1', 'v1', 'job-zero-max', '{}'::jsonb, 'PENDING',
      0, 0, '2026-09-03T12:00:00Z', '70000000-0000-4000-8000-000000000291', '70000000-0000-4000-8000-000000000292', '2026-09-03T12:00:00Z'
    )
  $$,
  '23514',
  NULL,
  'max_attempts must be positive'
);

SELECT throws_ok(
  $$
    INSERT INTO operations.jobs (
      id, type, contract_version, idempotency_key, payload, status,
      attempt_count, max_attempts, available_at, correlation_id, causation_id, created_at
    ) VALUES (
      '70000000-0000-4000-8000-000000000203', 'TEST.v1', 'v1', 'job-over-max', '{}'::jsonb, 'PENDING',
      4, 3, '2026-09-03T12:00:00Z', '70000000-0000-4000-8000-000000000291', '70000000-0000-4000-8000-000000000292', '2026-09-03T12:00:00Z'
    )
  $$,
  '23514',
  NULL,
  'attempt_count cannot exceed max_attempts'
);

SELECT throws_ok(
  $$
    INSERT INTO operations.jobs (
      id, type, contract_version, idempotency_key, payload, status,
      attempt_count, max_attempts, available_at, correlation_id, causation_id, created_at
    ) VALUES (
      '70000000-0000-4000-8000-000000000204', 'TEST.v1', 'v1', 'job-invalid-status', '{}'::jsonb, 'QUEUED',
      0, 3, '2026-09-03T12:00:00Z', '70000000-0000-4000-8000-000000000291', '70000000-0000-4000-8000-000000000292', '2026-09-03T12:00:00Z'
    )
  $$,
  '23514',
  NULL,
  'unknown job statuses are rejected'
);

SELECT throws_ok(
  $$
    INSERT INTO operations.jobs (
      id, type, contract_version, idempotency_key, payload, status,
      attempt_count, max_attempts, available_at, lease_expires_at,
      correlation_id, causation_id, created_at
    ) VALUES (
      '70000000-0000-4000-8000-000000000205', 'TEST.v1', 'v1', 'job-pending-lease', '{}'::jsonb, 'PENDING',
      0, 3, '2026-09-03T12:00:00Z', '2026-09-03T12:05:00Z',
      '70000000-0000-4000-8000-000000000291', '70000000-0000-4000-8000-000000000292', '2026-09-03T12:00:00Z'
    )
  $$,
  '23514',
  NULL,
  'pending jobs cannot retain a lease'
);

SELECT throws_ok(
  $$
    INSERT INTO operations.jobs (
      id, type, contract_version, idempotency_key, payload, status,
      attempt_count, max_attempts, available_at, lease_expires_at,
      correlation_id, causation_id, created_at
    ) VALUES (
      '70000000-0000-4000-8000-000000000206', 'TEST.v1', 'v1', 'job-running-no-start', '{}'::jsonb, 'RUNNING',
      1, 3, '2026-09-03T12:00:00Z', '2026-09-03T12:05:00Z',
      '70000000-0000-4000-8000-000000000291', '70000000-0000-4000-8000-000000000292', '2026-09-03T12:00:00Z'
    )
  $$,
  '23514',
  NULL,
  'running jobs require a start timestamp'
);

SELECT throws_ok(
  $$
    INSERT INTO operations.jobs (
      id, type, contract_version, idempotency_key, payload, status,
      attempt_count, max_attempts, available_at, correlation_id, causation_id,
      created_at, started_at
    ) VALUES (
      '70000000-0000-4000-8000-000000000207', 'TEST.v1', 'v1', 'job-complete-no-finish', '{}'::jsonb, 'COMPLETED',
      1, 3, '2026-09-03T12:00:00Z', '70000000-0000-4000-8000-000000000291', '70000000-0000-4000-8000-000000000292',
      '2026-09-03T12:00:00Z', '2026-09-03T12:01:00Z'
    )
  $$,
  '23514',
  NULL,
  'completed jobs require a completion timestamp'
);

SELECT throws_ok(
  $$
    INSERT INTO operations.jobs (
      id, type, contract_version, idempotency_key, payload, status,
      attempt_count, max_attempts, available_at, correlation_id, causation_id,
      created_at, started_at, completed_at
    ) VALUES (
      '70000000-0000-4000-8000-000000000208', 'TEST.v1', 'v1', 'job-failed-no-error', '{}'::jsonb, 'FAILED',
      3, 3, '2026-09-03T12:00:00Z', '70000000-0000-4000-8000-000000000291', '70000000-0000-4000-8000-000000000292',
      '2026-09-03T12:00:00Z', '2026-09-03T12:01:00Z', '2026-09-03T12:02:00Z'
    )
  $$,
  '23514',
  NULL,
  'failed jobs preserve a structured error'
);

SELECT lives_ok(
  $$
    INSERT INTO operations.jobs (
      id, type, contract_version, idempotency_key, payload, status,
      attempt_count, max_attempts, available_at, correlation_id, causation_id,
      last_error, created_at, started_at
    ) VALUES (
      '70000000-0000-4000-8000-000000000209', 'TEST.v1', 'v1', 'job-pending-retry', '{}'::jsonb, 'PENDING',
      1, 3, '2026-09-03T12:05:00Z', '70000000-0000-4000-8000-000000000291', '70000000-0000-4000-8000-000000000292',
      '{"code":"RETRYABLE"}'::jsonb, '2026-09-03T12:00:00Z', '2026-09-03T12:01:00Z'
    )
  $$,
  'a pending retry can retain prior attempt provenance without a live lease'
);

SELECT throws_ok(
  $$
    INSERT INTO operations.jobs (
      id, type, contract_version, idempotency_key, payload, status,
      attempt_count, max_attempts, available_at, lease_expires_at,
      correlation_id, causation_id, created_at, started_at, completed_at
    ) VALUES (
      '70000000-0000-4000-8000-000000000210', 'TEST.v1', 'v1', 'job-terminal-lease', '{}'::jsonb, 'COMPLETED',
      1, 3, '2026-09-03T12:00:00Z', '2026-09-03T12:05:00Z',
      '70000000-0000-4000-8000-000000000291', '70000000-0000-4000-8000-000000000292',
      '2026-09-03T12:00:00Z', '2026-09-03T12:01:00Z', '2026-09-03T12:02:00Z'
    )
  $$,
  '23514',
  NULL,
  'terminal jobs cannot retain a lease'
);

SELECT * FROM finish();
ROLLBACK;
