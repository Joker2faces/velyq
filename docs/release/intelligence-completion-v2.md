# Intelligence Completion V2

## Scope

This branch starts from the verified Claude Cloudflare POC at `3bd0a46` and
adds a provider-neutral, deterministic intelligence domain layer without
changing the static-shell architecture or connecting a real provider.

The request-path layer is bounded and Decimal-safe. Backtest, calibration and
large replay operations remain offline concerns; this branch only supplies
their deterministic evaluation primitives and temporal contracts.

## Added modules

- `packages/analytics/src/intelligence-v2.ts`
  - price validity and sensitivity
  - decision/refusal states, risks and invalidation conditions
  - scenario execution and immutable snapshot diffs
  - lifecycle transition validation
  - bookmaker market summary and normalized probability
  - Brier evaluation primitive
  - temporal cutoff validation
  - post-match decision-quality/result separation
  - disabled AI analyst contract
- `packages/analytics/test/intelligence-v2.test.ts`
- `packages/analytics/package.json` and lockfile: direct `decimal.js` dependency

## Policies and contracts

- Decision policy: `decision.v1`
- Price state: `ATTRACTIVE`, `MARGINAL`, `AT_FAIR`, `BELOW_FAIR`, `UNAVAILABLE`
- Decision states include `EDGE`, `WATCH`, `WAIT_FOR_LINEUP`, `NO_BET`,
  `INSUFFICIENT_DATA`, and `EDGE_DISAPPEARED`.
- AI remains disabled with `AI_ANALYST_ENABLED = false`.

## Integration concerns

The new layer is domain-only and does not alter routes, CSS, locale URLs,
static generation, auth, billing, database migrations, or Cloudflare worker
configuration. It should be reviewed before wiring into customer APIs.

The current market summary is intentionally bounded and preserves bookmaker
provenance in its input contract. Full multi-outcome market maps, persistence
of decision history, and real-data closing-line validation require the existing
database/application integration layer and are not fabricated here.

## Database and real data

No database migration was added. No production or staging database was
modified. No real provider was connected. Synthetic/demo data remains clearly
separate from real-data claims.

## Verification

Baseline at `3bd0a46`: 70 test files, 527 tests passed.

The V2 analytics tests cover price sensitivity, decision refusal, lifecycle,
temporal guards, market aggregation, Brier evaluation, post-match semantics,
and AI-disabled behavior. Full verification results are recorded in the final
task report.
