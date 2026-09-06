# Task 3 report: RADAR, consensus, market map, and ranking

## Delivered

- Added pure, provider-neutral RADAR movement classification with the explicit `movement.v1` policy. It validates decimal odds, rejects duplicate timestamped bookmaker observations, and reports `SHORTENED`, `DRIFTED`, `UNCHANGED`, or `INSUFFICIENT_HISTORY` without inferring sharp or steam activity.
- Added `no-vig.v1` consensus contracts for complete 1X2 and two-way markets. They calculate raw and proportional no-vig implied probabilities, median overround, best/median/min/max odds, dispersion, bookmaker count, agreement, and outcome-level outlier candidate flags.
- Added market-map DTO construction plus decimal-safe `rank.v1` opportunity ranking and freshness-first daily prioritization.
- Exported the five Task 3 interfaces from `@velyq/intelligence` and added focused coverage in the two requested test files.

## Test-first evidence

1. The initial focused run failed with all eight requested behaviors because the five Task 3 public functions were absent.
2. After the minimal implementation and the fair-market normalization correction, the focused suite passed: 2 files, 8 tests.

## Verification

- `corepack pnpm --filter @velyq/intelligence typecheck` passed.
- `corepack pnpm exec vitest run --config tooling/vitest/vitest.config.mts packages/intelligence/test/radar-consensus.test.ts packages/intelligence/test/ranking.test.ts` passed: 2 files, 8 tests.
- `corepack pnpm lint` passed with zero warnings.
- `corepack pnpm typecheck` passed across 18 packages.
- `corepack pnpm test` passed: 72 files, 533 tests.
- Targeted Prettier and `git diff --check` passed.

## Scope

- Only Task 3 intelligence source, exports, tests, and this report are included in the commit.
- No UI, database, provider, deployment, or lockfile changes are included.
- The pre-existing `pnpm-lock.yaml` modification remains unstaged and untouched.
