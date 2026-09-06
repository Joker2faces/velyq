# VELYQ Intelligence Engine Design

## Purpose

Build a provider-neutral, deterministic football market-intelligence foundation. It must explain model-versus-market disagreement, fair-price validity, evidence quality, lifecycle changes, and valid negative decisions without making betting guarantees or fabricating live data.

## Boundaries

All quantitative work lives in platform-neutral workspace packages and uses `@velyq/decimal` branded decimal values. Domain code returns stable codes and contracts, never localized business prose. No database migration, provider credential, AI call, Stripe work, UI redesign, Worker deployment, or change to `cloudflare/velyq-poc` is in scope.

## Architecture

`@velyq/intelligence` will be a pure package that consumes validated decimal values and provider-neutral records. It exposes decision, price, quality, evidence, lifecycle, consensus, backtest, and AI-tool contracts. `@velyq/providers` owns normalization, mapping, deduplication, retry, and scheduling boundary contracts. `@velyq/contracts` re-exports serializable customer/API DTOs where existing applications need them.

## Decisions

- Policy identifiers are explicit: `decision.v1`, `quality.v1`, `rank.v1`, `movement.v1`, `no-vig.v1`, and `freshness.v1`.
- Valid decision states are `STRONG_EDGE`, `EDGE`, `WATCH`, `WAIT`, `WAIT_FOR_LINEUP`, `NO_BET`, `INSUFFICIENT_DATA`, and `EDGE_DISAPPEARED`.
- A price threshold is calculated as `1 / modelProbability`; price validity and EV are always derived from decimal-safe arithmetic.
- Stale, missing, weakly mapped, insufficiently covered, or materially changed-lineup inputs override a high numerical EV.
- Synthetic scenarios are clearly labelled and deterministic; LIVE mode never silently falls back to synthetic output.
- Future AI is a disabled interface over authoritative tools. `AI_ANALYST_ENABLED` is false by default and no provider implementation, token, secret, or external call exists.

## Verification

Unit and invariant tests cover canonical 1.85/60% semantics, no-vig normalization, price thresholds, lifecycle transitions, cutoff leakage, normalization/deduplication, and invalid boundaries. The branch must pass formatting, lint, typecheck, unit tests, normal Next build, Vinext build, post-Vinext typecheck, and Worker bundle verification before handoff.
