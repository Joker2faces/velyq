# Task 2 report: Quality, evidence, lifecycle, history, and match intelligence

## Delivered

- Added frozen, provider-neutral quality, evidence, lifecycle, snapshot-history, and match-intelligence contracts to `@velyq/intelligence`.
- Added stable policy versions: `quality.v1`, `decision.v1`, and `materiality.v1`.
- Added focused contract tests for required quality degradation, coverage and lineup risks, ordered evidence, lifecycle validation (including `EDGE_DISAPPEARED`), material snapshot changes, and JSON-safe aggregates.

## Test-first evidence

1. Initial focused run failed because the five Task 2 public functions were absent from the Task 1 API.
2. After the minimal implementation, the focused suite passed: 2 files, 11 tests.

## Verification

- `corepack pnpm --filter @velyq/intelligence typecheck` passed.
- `corepack pnpm lint` passed with zero warnings.
- Targeted `prettier --check` passed.
- `git diff --check` passed.
- `corepack pnpm test` passed: 70 files, 523 tests.

## Scope and concerns

- No application, database, provider, UI, deployment, or billing files were changed.
- The pre-existing `pnpm-lock.yaml` modification was left untouched and is not part of this task's commit.

## Review round 1 fixes

- I1: Evidence timeline ordering now compares parsed ISO instants for `observedAt` and `effectiveAt`, then applies `referenceId` and original index as deterministic tie-breakers. The focused regression covers an offset ISO timestamp that lexical ordering previously misplaced.
- I2: History changes deep-copy and freeze nested decision-quality and verdict values; match-intelligence consequently exposes only independent frozen snapshot and change objects. The mutation regression changes caller-owned arrays after construction and verifies the history and aggregate output remain unchanged.

### Review verification

- RED: the two new regressions failed before implementation (offset chronology and mutable nested history values).
- GREEN: `corepack pnpm exec vitest run --config tooling/vitest/vitest.config.mts packages/intelligence/test/quality-lifecycle.test.ts packages/intelligence/test/evidence-history.test.ts` passed: 2 files, 13 tests.
- `corepack pnpm --filter @velyq/intelligence typecheck` passed.
- `corepack pnpm lint` passed with zero warnings.
- Targeted `prettier --check` and `git diff --check` passed.
