# Data Semantics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make customer-facing numeric semantics exact and expose traceable, discoverable synthetic scenarios without redesigning the customer UI.

**Architecture:** Keep exact presentation arithmetic inside `@velyq/ui`, using decimal-string operations rather than JavaScript `Number`. Extend the customer DTO with a small scenario descriptor and populate the synthetic preview from canonical replay fixture identifiers; expose one reusable status component so existing screens can surface the descriptor consistently.

**Tech Stack:** TypeScript 6, Vitest 4, React 19, Next.js 16, pnpm workspace

**Spec:** `docs/superpowers/specs/2026-09-03-velyq-phase-1-design.md`

## Global Constraints

- Do not redesign customer UI.
- Do not touch auth, billing, or deployment behavior.
- Decimal values remain canonical strings across domain and presentation boundaries.
- Synthetic customer data remains explicitly labelled `Synthetic data`.

---

### Task 1: Exact numeric presentation

**Files:**
- Modify: `packages/ui/src/index.ts`
- Test: `packages/ui/test/formatting.test.ts`

**Interfaces:**
- Consumes: canonical decimal strings or `null`
- Produces: `formatDecimal`, `formatPercent`, and `formatPercentagePoints` localized display strings

- [ ] **Step 1: Write failing formatter regressions**

Add literal expectations proving that a value beyond JavaScript's safe integer range rounds exactly and that `0.059459459459` renders as `+5.9 pp` through `formatPercentagePoints`.

- [ ] **Step 2: Run the UI formatter test and verify failure**

Run: `corepack pnpm test packages/ui/test/formatting.test.ts`

Expected: failure from unsafe `Number` coercion and the missing percentage-point export.

- [ ] **Step 3: Implement exact string rounding and percentage-point formatting**

Replace binary-number coercion with decimal coefficient/scale rounding. Retain the existing locale, sign, null, and precision behavior; append ` pp` for percentage points.

- [ ] **Step 4: Run the UI formatter test and verify pass**

Run: `corepack pnpm test packages/ui/test/formatting.test.ts`

Expected: all formatter assertions pass.

### Task 2: Scenario and trace contracts

**Files:**
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/test/customer-contracts.test.ts`
- Modify: `apps/web/app/customer-data.ts`
- Create: `apps/web/app/scenario-status.tsx`
- Create: `apps/web/test/customer-data.test.ts`
- Modify: `tooling/vitest/vitest.config.mts`

**Interfaces:**
- Consumes: canonical `ScenarioState`, scenario ID, source observation IDs, and normalized movement ratios
- Produces: required `CustomerMatchDto.scenario`, validated trace IDs, fixture-backed synthetic preview records, and `ScenarioStatus({ scenario })`

- [ ] **Step 1: Write failing contract and fixture regressions**

Require a scenario descriptor with a non-empty ID, canonical state, and human-readable label. Assert all seven preview records have unique customer event IDs, canonical fixture scenario IDs, non-empty trace source IDs, and movement ratios that render in the expected percentage range.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `corepack pnpm test packages/contracts/test/customer-contracts.test.ts apps/web/test/customer-data.test.ts`

Expected: failure because the DTO, fixture trace fields, normalized movement values, and scenario descriptor are absent.

- [ ] **Step 3: Implement the minimal data and component contract**

Add and validate the scenario descriptor, populate each preview record with canonical replay scenario/source IDs, normalize movement fields to ratios, and add a small status component that displays the scenario label with its machine-readable state.

- [ ] **Step 4: Run focused tests and verify pass**

Run: `corepack pnpm test packages/contracts/test/customer-contracts.test.ts apps/web/test/customer-data.test.ts`

Expected: all contract and fixture assertions pass.

### Task 3: Wire semantic formatters and scenario discovery

**Files:**
- Modify: `apps/web/app/today/page.tsx`
- Modify: `apps/web/app/edge/page.tsx`
- Modify: `apps/web/app/radar/page.tsx`
- Modify: `apps/web/app/matches/[id]/page.tsx`

**Interfaces:**
- Consumes: `CustomerMatchDto.scenario`, `formatPercentagePoints`, `formatPercent`, and `formatDecimal`
- Produces: correctly labelled edge, movement, odds, and scenario text on existing customer screens

- [ ] **Step 1: Wire the existing layouts to the new semantic contracts**

Use percentage points only for probability edge, percent only for ratios such as movement and expected value, exact decimal formatting for odds, and `ScenarioStatus` at existing row/detail metadata boundaries.

- [ ] **Step 2: Run typecheck and focused tests**

Run: `corepack pnpm typecheck && corepack pnpm test packages/ui/test/formatting.test.ts packages/contracts/test/customer-contracts.test.ts apps/web/test/customer-data.test.ts`

Expected: zero type errors and all focused tests pass.

### Task 4: Verify and commit

**Files:**
- Verify all modified files above

**Interfaces:**
- Consumes: completed implementation
- Produces: one reviewable commit

- [ ] **Step 1: Run the repository verification suite**

Run: `corepack pnpm verify`

Expected: formatting, lint, typecheck, unit tests, and builds all exit successfully.

- [ ] **Step 2: Review the diff and commit**

Run: `git diff --check`, review `git diff`, then commit as `fix: make synthetic data semantics traceable`.
