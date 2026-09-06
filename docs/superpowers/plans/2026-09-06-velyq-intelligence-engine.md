# VELYQ Intelligence Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a deterministic, provider-neutral VELYQ decision-intelligence foundation without touching live Cloudflare deployment, billing, production data, or UI navigation.

**Architecture:** Add a pure `@velyq/intelligence` package for quantitative intelligence and policy. Extend provider-neutral `@velyq/providers` contracts for normalized data ingestion. Keep existing web applications consuming unchanged platform-isolated runtime modules; only add safe optional contracts and synthetic fixtures.

**Tech Stack:** TypeScript, Vitest, `decimal.js` through `@velyq/decimal`, pnpm/Turbo, Next 16, Vinext/Workers.

**Spec:** `docs/superpowers/specs/2026-09-06-velyq-intelligence-engine-design.md`

## Global Constraints

- Base is `origin/cloudflare/velyq-poc` at `62eca96ee7d868357c2a5368fd59988d97d1385e`.
- Work only on `codex/intelligence-engine-release`; never modify, merge, deploy, or push `cloudflare/velyq-poc`.
- Use `@velyq/decimal`; no JavaScript floating-point for odds, probabilities, EV, or movement.
- Do not add database migrations, provider credentials, OpenAI credentials, AI calls, Stripe/billing work, customer-plan QA, or broad UI changes.
- Decisions are coded states, not confidence claims; model maturity stays `EXPERIMENTAL`.
- AI is architecture only with `AI_ANALYST_ENABLED=false`.

### Task 1: Intelligence package and decimal-safe price engine

**Files:** Create `packages/intelligence/package.json`, `packages/intelligence/tsconfig.json`, `packages/intelligence/src/{index.ts,price.ts,decision.ts}`, and `packages/intelligence/test/price-decision.test.ts`; modify workspace configuration only if package discovery requires it.

**Interfaces:** `evaluatePriceValidity({ modelProbability, currentOdds }): PriceValidity`; `createPriceSensitivity({ modelProbability, candidateOdds }): readonly PriceScenario[]`; `evaluateDecision(input: DecisionInput): DecisionVerdict`.

- [ ] Write tests for 0.60 at 1.85: fair/minimum odds 1.666…, raw implied 0.54054…, probability edge 0.05945…, EV 0.11, attractive price; test 2.10 to 1.85 movement is approximately -0.11905.
- [ ] Run the tests and confirm imports fail before implementation.
- [ ] Implement branded-decimal conversion, fair odds, EV, price margin/state, sensitivity, deterministic reason codes, and negative decision overrides.
- [ ] Test missing/invalid odds, zero/one probabilities, zero EV, stale price, missing lineup, low coverage, and edge disappearance.
- [ ] Commit `feat(intelligence): add price validity and decision engine`.

### Task 2: Quality, evidence, lifecycle, history, and match-intelligence contracts

**Files:** Create `packages/intelligence/src/{quality.ts,evidence.ts,lifecycle.ts,history.ts,match-intelligence.ts}` and `packages/intelligence/test/{quality-lifecycle.test.ts,evidence-history.test.ts}`.

**Interfaces:** `assessDecisionQuality`, `buildEvidenceTimeline`, `transitionOpportunity`, `diffDecisionSnapshots`, `buildMatchIntelligence`.

- [ ] Write failing tests for stale/low-coverage quality overrides, ordered evidence using `observedAt`, legal/illegal lifecycle transitions, `EDGE_DISAPPEARED`, snapshot materiality, and no undefined/non-finite JSON fields.
- [ ] Implement versioned quality/risk/invalidation/evidence/snapshot contracts and pure transition/diff functions.
- [ ] Verify an actionable high-EV result is downgraded when quality policy requires it.
- [ ] Commit `feat(intelligence): add evidence and decision lifecycle`.

### Task 3: RADAR, consensus, market map, ranking, and opportunity priority

**Files:** Create `packages/intelligence/src/{radar.ts,consensus.ts,market-map.ts,ranking.ts}` and `packages/intelligence/test/{radar-consensus.test.ts,ranking.test.ts}`.

**Interfaces:** `analyzeRadarMovement`, `calculateMarketConsensus`, `buildMarketMap`, `rankOpportunities`, `prioritizeToday`.

- [ ] Write failing 1X2 and two-way no-vig tests, normalized-probability sum invariants, duplicate/outlier/insufficient-history tests, and freshness-first prioritization tests.
- [ ] Implement raw and normalized implied probabilities, overround, best/median/min/max/dispersion, objective movement and outlier flags, versioned rank outputs, and market-map DTOs.
- [ ] Commit `feat(intelligence): add radar and market consensus`.

### Task 4: Scenario, post-match, calibration, audit, and leakage guards

**Files:** Create `packages/intelligence/src/{scenario.ts,autopsy.ts,audit.ts,backtest.ts}` and `packages/intelligence/test/{scenario-audit.test.ts,backtest.test.ts}`.

**Interfaces:** `runScenario`, `evaluateDecisionAutopsy`, `evaluateCalibration`, `calculateBrierScore`, `calculateLogLoss`, `validateBacktestRecord`.

- [ ] Write failing tests for odds/model scenarios without fabricated lineup-probability adjustment, outcome separate from decision quality, unavailable closing price, calibration buckets, and observations after feature cutoff rejection.
- [ ] Implement pure scenario, autopsy, audit, backtest, and leakage-validation contracts.
- [ ] Commit `feat(intelligence): add scenario and model audit foundations`.

### Task 5: Provider-neutral data contracts and deterministic ingestion utilities

**Files:** Create `packages/providers/src/{intelligence-contracts.ts,normalization.ts,deduplication.ts,retry.ts,scheduling.ts}` and `packages/providers/test/intelligence-contracts.test.ts`; modify `packages/providers/src/index.ts`.

**Interfaces:** `FixtureProvider`, `OddsProvider`, `LineupProvider`, `ResultsProvider`, `normalizeOddsObservation`, `deduplicateObservations`, `createRetryPolicy`, `selectPollingCadence`.

- [ ] Write failing tests for FT_1X2 and OVER_UNDER_2_5 normalization, odds <= 1 rejection, mapping confidence, provenance, duplicate idempotency, out-of-order observations, stale data, outlier candidates, and bounded 429/5xx retry plans.
- [ ] Implement provider-neutral records with separate internal/provider identifiers; do not add a live vendor adapter.
- [ ] Commit `feat(providers): add intelligence data contracts`.

### Task 6: Disabled AI analyst and application-facing contracts

**Files:** Create `packages/intelligence/src/{ai.ts,tools.ts,contracts.ts}` and `packages/intelligence/test/ai-contracts.test.ts`; modify `packages/intelligence/src/index.ts` and `packages/contracts/src/index.ts` only for serializable exports.

**Interfaces:** `AI_ANALYST_ENABLED=false`, `AiAnalystProvider`, `DecisionIntelligenceTools`, `AskVelyqRequest`, `AskVelyqResponse`.

- [ ] Write tests proving the flag defaults false, no provider is called when disabled, and AI response categories cannot overwrite deterministic verdict values.
- [ ] Implement interfaces/types only; no token name that is public, no external SDK, and no fake response.
- [ ] Commit `feat(intelligence): add disabled analyst contracts`.

### Task 7: Synthetic coverage, docs, integration notes, and release verification

**Files:** Modify provider synthetic fixtures only when deterministic lifecycle coverage is absent; create `docs/product/velyq-intelligence-system.md` and `docs/release/codex-intelligence-integration.md`.

- [ ] Add deterministic fixtures/tests covering every decision state, changed lineup, stale/missing price, movement directions, and positive/negative/near-zero EV.
- [ ] Document implemented/provider-ready/historical-data/future states and exact integration boundaries for Claude’s branch.
- [ ] Run `pnpm format`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm verify`, normal Next build, Vinext build, post-Vinext typecheck, and `pnpm worker:verify`.
- [ ] Review the full branch diff for numerical, platform, security, provider-coupling, and UI-conflict defects; fix with regression tests.
- [ ] Commit focused documentation/fix commits, push only `codex/intelligence-engine-release`, and record local/remote SHA equality.
