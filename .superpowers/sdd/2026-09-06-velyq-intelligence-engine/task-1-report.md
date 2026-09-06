# Task 1 Report: Intelligence Package and Price Engine

## Status

Complete. The task adds the framework-neutral `@velyq/intelligence` package
with decimal-safe price validity, sensitivity, and deterministic decision
verdicts. Model maturity is retained as `EXPERIMENTAL` throughout.

## Files

- `packages/intelligence/package.json`
- `packages/intelligence/tsconfig.json`
- `packages/intelligence/src/index.ts`
- `packages/intelligence/src/price.ts`
- `packages/intelligence/src/decision.ts`
- `packages/intelligence/test/price-decision.test.ts`
- `packages/intelligence/test/tsconfig.json`

## Behavior

- Price validity derives fair/minimum odds, raw implied probability, edge, EV,
  and price status solely through `@velyq/decimal` operations.
- Sensitivity returns immutable candidate-price scenarios and exact relative
  movement.
- Decision verdicts expose only stable state and reason codes. Freshness,
  lineup, and coverage gates override numerical EV; a lost prior edge becomes
  `EDGE_DISAPPEARED`.

## Tests and Verification

- Red phase confirmed: the new focused test initially failed because the
  package entry point did not exist.
- Focused Vitest suite: 9 passed.
- Package typecheck: passed.
- Workspace lint: passed.
- Task-file Prettier check: passed.

## Commit

`feat(intelligence): add price validity and decision engine`

## Concerns

`pnpm-lock.yaml` remains unchanged. A direct check of its `HEAD` version
confirms it already conforms to Prettier; an earlier warning came from a local
package-runner rewrite that was reverted without committing the lockfile.
