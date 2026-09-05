# VELYQ Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the VELYQ Foundation Vertical Slice using deterministic synthetic football data with exact arithmetic, canonical markets, immutable provenance, transparent development scores, secure user/admin boundaries, and deployment-ready web applications.

**Architecture:** A pnpm/Turborepo modular monolith contains separate Next.js customer/admin apps, pure domain packages, Drizzle/PostgreSQL adapters, and independently executable ingestion/prediction workers. All application behavior flows through use cases and versioned contracts; Supabase supplies PostgreSQL and Auth while Vercel serves request-oriented workloads.

**Tech Stack:** pnpm, Turborepo, strict TypeScript, Next.js App Router, React, Tailwind CSS, selective shadcn/ui, Drizzle ORM, Supabase PostgreSQL/Auth, decimal.js, Zod, Vitest, Playwright, GitHub Actions, Vercel.

**Spec:** `docs/superpowers/specs/2026-09-03-velyq-phase-1-design.md`

## Global constraints

- Do not connect to or imply a real sports/bookmaker feed in Phase 1.
- All fixtures, providers, bookmakers, teams, players, and prices are fictional/synthetic and visibly labeled.
- Never use JavaScript `number` for odds, probabilities, edges, EV, lines, score components, or money.
- PostgreSQL `numeric` and JSON/API decimal values cross boundaries as canonical decimal strings.
- Predictions, odds, provenance, quality assessments, score results, evidence, and audit events are append-only.
- EDGE and RADAR validation status is exactly `DEVELOPMENT_HEURISTIC` in Phase 1.
- The experimental prediction model maturity is exactly `EXPERIMENTAL`.
- Domain packages do not depend on Next.js, Supabase, Drizzle, provider payloads, or UI code.
- External input starts as `unknown` and is runtime-validated.
- No application implementation begins until this plan and its specification receive explicit approval.

## Planned file map

The paths below lock package ownership; exact leaf files may be split further if a review finds a file has more than one responsibility.

```text
package.json pnpm-workspace.yaml turbo.json tsconfig.json
.github/workflows/ci.yml .env.example
apps/web/app/... apps/web/src/{bff,i18n}/...
apps/admin/app/... apps/admin/src/bff/...
workers/ingestion/src/... workers/prediction/src/...
packages/decimal/src/{decimal,value-objects,codecs}.ts
packages/market-semantics/src/{market-key,definitions,settlement}.ts
packages/domain/src/{events,odds,predictions,provenance,recommendations}.ts
packages/analytics/src/{value,no-vig,data-quality,edge,radar}.ts
packages/providers/src/{ports,policy,mappings,mock}/...
packages/contracts/src/{api,jobs}/...
packages/application/src/{ports,use-cases,authorization}/...
packages/database/src/{schema,repositories}/...
packages/database/drizzle/*.sql
packages/auth/src/{permissions,entitlements}.ts
packages/ui/src/... packages/config/src/... packages/observability/src/...
packages/test-utils/src/...
```

---

## Milestone 1: Workspace and verification foundation

**Goal:** Establish a minimal, reproducible monorepo with no product behavior yet.

**Files/packages affected:** Root workspace files; `tooling/*`; skeleton manifests for `apps/*`, `workers/*`, and `packages/*`; `.gitignore`; `.env.example`; CI workflow.

**Database changes:** None.

**Dependencies:** Approved specification and plan.

**Interfaces produced:** Workspace scripts `lint`, `typecheck`, `test`, `test:integration`, `test:e2e`, `build`, `db:reset`, and `mock:replay` are reserved. Package import aliases and boundary lint rules are established.

- [ ] Pin Node and pnpm versions; create pnpm workspace and Turbo pipeline.
- [ ] Create strict shared TypeScript, ESLint, Tailwind, and test configurations.
- [ ] Add minimal package manifests and public entry points without feature code.
- [ ] Add boundary lint rules that reject internal cross-package imports and forbidden domain dependencies.
- [ ] Create typed environment-package tests first, including rejection of secret variables in the public allowlist.
- [ ] Implement environment schemas and `.env.example` until those tests pass.
- [ ] Add CI jobs for format, lint, typecheck, unit tests, builds, and placeholder integration/E2E stages that fail if silently skipped.
- [ ] Verify clean install, lint, typecheck, test, and build from an empty dependency cache.
- [ ] Commit as `chore: establish VELYQ workspace foundation`.

**Tests:** Workspace boundary fixtures; environment-schema unit tests; build smoke tests.

**Acceptance criteria:** One documented command installs and verifies the workspace; no external credentials are needed; forbidden dependency imports fail linting; both empty apps build.

## Milestone 2: Exact decimal domain

**Goal:** Make exact decimal arithmetic the only path for market calculations.

**Files/packages affected:** `packages/decimal`; focused test files; shared JSON/DB codec interfaces.

**Database changes:** None.

**Dependencies:** Milestone 1.

**Interfaces produced:** `DecimalString`, `DecimalOdds`, `Probability`, `FairProbability`, `ImpliedProbability`, `Edge`, `ExpectedValue`, `MarketLine`, `Money`; constructors returning typed success/failure; `numericToDecimalString`; `decimalStringToNumeric`.

- [ ] Write failing tests for canonical string parsing, range rejection, exponent rejection/normalization, and exact `0.1 + 0.2` behavior.
- [ ] Add pinned `decimal.js` and configure one cloned constructor with documented precision and rounding.
- [ ] Implement immutable constructors and arithmetic helpers without exposing the Decimal instance across the public API.
- [ ] Write failing property-style tests for probability/odds bounds and serialization round trips.
- [ ] Implement PostgreSQL and JSON codecs that accept/return strings only.
- [ ] Add a lint restriction banning direct `decimal.js` imports outside this package and arithmetic on branded decimal fields.
- [ ] Run decimal tests, package typecheck, and full unit suite.
- [ ] Commit as `feat: add exact market decimal domain`.

**Tests:** Exact arithmetic examples; legal-boundary cases; invalid NaN/infinity/exponents; JSON and NUMERIC string round trips; money currency validation.

**Acceptance criteria:** No public core API accepts a JS number; exact results match canonical strings; invalid odds/probabilities cannot be constructed.

## Milestone 3: Canonical market semantics

**Goal:** Define reusable market identity and versioned settlement contracts before persistence.

**Files/packages affected:** `packages/market-semantics`; `packages/domain` event identifiers; tests.

**Database changes:** None.

**Dependencies:** Milestone 2.

**Interfaces produced:** `MarketDefinition`, `MarketKey`, `EventMarket`, `MarketOutcome`, `SettlementRule`, `SettlementResult`, `serializeMarketKey`, `settleMarket`.

- [ ] Write failing tests proving full-time and first-half 1X2 have different keys; 2.5 and 2.25 totals differ; event/team/player scopes differ.
- [ ] Implement canonical enums/codes, key validation, and deterministic serialization using `MarketLine`.
- [ ] Write failing tests for invalid missing/extra lines, unsupported increments, and subject mismatch.
- [ ] Implement market-definition validation and explicit error types.
- [ ] Write settlement tests for full-time 1X2 and Over/Under 2.5 including win/loss/void and non-final results.
- [ ] Implement versioned settlement registry for only those Phase 1 rules.
- [ ] Add contract fixtures showing future Asian total, handicap, player shots, saves, goalscorer, cards, and corners identities parse without implementing settlement.
- [ ] Run semantics and dependency-boundary tests.
- [ ] Commit as `feat: define canonical market semantics`.

**Tests:** Canonical key uniqueness; scope/period/line validation; supported settlement results; unsupported rules return typed errors.

**Acceptance criteria:** Odds and predictions can reference one canonical outcome identity; provider strings cannot serve as market identity; only declared settlement versions execute.

## Milestone 4: Supabase/Drizzle Phase 1 schema and security

**Goal:** Implement only the tables, constraints, indexes, append-only rules, and RLS defined in the specification.

**Files/packages affected:** `supabase/config.toml`; `packages/database/src/schema/*`; `packages/database/drizzle/*`; database tests; local seed role fixtures.

**Database changes:** Create the exact schemas/tables in Design Section 8, required extensions, constraints, indexes, roles/permissions seed, append-only triggers, and profile RLS.

**Dependencies:** Milestones 1–3.

**Interfaces produced:** Drizzle schema types; migration runner; repository transaction interface; database test identity helpers.

- [ ] Start local Supabase and create the migration through the supported CLI command rather than inventing a filename.
- [ ] Write failing schema-contract tests that assert the exact Phase 1 table allowlist and reject future target tables.
- [ ] Define Drizzle schema modules grouped by database schema and generate reviewed SQL.
- [ ] Add PKs, FKs, unique constraints, numeric checks, and indexes from the design specification.
- [ ] Write failing tests that attempt update/delete on every append-only table.
- [ ] Implement append-only trigger functions in a non-exposed schema and revoke public execution.
- [ ] Write failing RLS tests for anonymous, owner, other user, normal authenticated user, and admin service paths.
- [ ] Implement profile RLS and withhold browser grants from internal schemas.
- [ ] Seed roles, permissions, synthetic provider policy, model/score/quality definitions, and market semantics using deterministic IDs.
- [ ] Run database reset, migration status, advisors where available, schema tests, append-only tests, and RLS tests.
- [ ] Commit as `feat: add secured Phase 1 database foundation`.

**Tests:** Exact table allowlist; constraints; index presence; append-only failures; RLS matrix; clean reset from zero.

**Acceptance criteria:** A clean database reaches the expected state from migrations; no future table is present; protected history cannot be mutated; users cannot cross profile boundaries; internal schemas are not browser-exposed.

## Milestone 5: Provider ports, policy enforcement, and deterministic fixtures

**Goal:** Build a mock-first provider boundary that validates, governs, maps, and replays synthetic observations.

**Files/packages affected:** `packages/providers`; `packages/contracts`; `packages/test-utils`; synthetic JSON sequences.

**Database changes:** Seed fictional catalog, participants, bookmakers, provider mapping/version, and permitted synthetic-provider policy.

**Dependencies:** Milestones 2–4.

**Interfaces produced:** `FixtureSource`, `OddsSource`, `LineupSource`, `ProviderDataPolicy`, `PolicyDecision`, normalized batch contracts, `SyntheticReplaySource`.

- [ ] Write failing policy tests for permitted synthetic retention/display/replay and denial examples for raw retention/free display/export.
- [ ] Implement effective-dated policy parsing and `evaluateProviderAction` with explicit denial reasons.
- [ ] Write failing runtime-contract tests for malformed provider data, unknown markets, timestamps, and decimal strings.
- [ ] Implement provider ports and Zod schemas that parse from `unknown`.
- [ ] Author fictional catalog and four replay sequence files with fixed IDs/times/content hashes.
- [ ] Write failing replay tests that assert identical output over repeated runs and all required scenario states.
- [ ] Implement synthetic replay and versioned provider-market mapping; quarantine unknown mappings.
- [ ] Add permanent synthetic labeling fields to every normalized DTO.
- [ ] Run provider contract, policy, mapping, and deterministic replay tests.
- [ ] Commit as `feat: add governed synthetic provider replay`.

**Tests:** Rights decisions; malformed input; deterministic hashes; required scenarios; no real bookmaker/team identifiers; unmapped quarantine.

**Acceptance criteria:** The replay produces the full scenario matrix deterministically; no payload bypasses validation/policy/mapping; synthetic provenance is unambiguous.

## Milestone 6: Durable jobs and odds ingestion

**Goal:** Ingest replayed observations idempotently with complete provenance and durable downstream commands.

**Files/packages affected:** `packages/application` ports/use cases; `packages/contracts/src/jobs`; `packages/database` repositories; `workers/ingestion`; observability package.

**Database changes:** None beyond inserting runtime rows into provider runs, observations, markets, odds, lineups, and jobs.

**Dependencies:** Milestones 4–5.

**Interfaces produced:** Four versioned job schemas; `JobRepository`; `ProviderRunRepository`; `OddsObservationRepository`; `IngestProviderSequence` use case; worker entry point.

- [ ] Write failing job-contract tests for versions, idempotency/correlation/causation IDs, and invalid payloads.
- [ ] Implement job DTOs and database-backed lease/complete/fail repository behavior.
- [ ] Write failing ingestion integration tests for first replay, duplicate replay, stale/missing quotes, lineage timestamps, and rejection counts.
- [ ] Implement the ingestion use case with one transaction for accepted observations and downstream jobs.
- [ ] Implement source-observation and odds/lineup repositories using decimal string codecs.
- [ ] Add structured run/job logging with correlation IDs and redaction tests.
- [ ] Implement the ingestion worker composition root and fixed-clock CLI replay command.
- [ ] Verify duplicate replay does not duplicate historical observations or jobs.
- [ ] Commit as `feat: ingest synthetic odds with provenance`.

**Tests:** Job validation; lease recovery; retry limits; ingestion idempotency; append-only inserts; complete provenance; policy denial; structured log redaction.

**Acceptance criteria:** A named sequence creates traceable observations exactly once, produces downstream jobs, records accepted/rejected counts, and can be replayed identically.

## Milestone 7: Data quality and recommendation policy

**Goal:** Evaluate trustworthy inputs before any prediction or recommendation.

**Files/packages affected:** `packages/analytics/src/data-quality`; `packages/domain/src/recommendations`; application/database adapters; tests.

**Database changes:** Insert quality assessments at runtime; seed one versioned Phase 1 policy labeled development-only.

**Dependencies:** Milestone 6.

**Interfaces produced:** `assessDataQuality`, `DataQualityAssessment`, `RecommendationStatus`, `decideRecommendation`.

- [ ] Write failing tests for freshness, missing prices, bookmaker coverage, expected/official/missing lineup, and mapping-confidence components.
- [ ] Implement pure component calculations using exact decimal objects and fixed clocks.
- [ ] Write failing scenario tests for `NO_BET`, `WAIT`, `WAIT_FOR_LINEUP`, `INSUFFICIENT_DATA`, and `EDGE_DISAPPEARED`.
- [ ] Implement versioned quality and recommendation policies with reason codes.
- [ ] Add append-only persistence and as-of repository queries.
- [ ] Verify every refusal stores policy version, components, score, grade, and reasons.
- [ ] Commit as `feat: add versioned quality and refusal policies`.

**Tests:** Threshold boundaries; stale/missing combinations; deterministic grades; all required statuses; as-of exclusion.

**Acceptance criteria:** Quality runs before modeling; insufficient inputs never receive fabricated metrics; each required recommendation state is reproducible and explained.

## Milestone 8: Experimental prediction and exact value engine

**Goal:** Produce immutable traceable predictions and exact value metrics from eligible synthetic inputs.

**Files/packages affected:** `packages/analytics/src/{value,no-vig}`; `packages/domain/src/predictions`; prediction use cases/repositories; `workers/prediction`.

**Database changes:** Runtime inserts into prediction runs, predictions, inputs, and quality assessments.

**Dependencies:** Milestones 2, 3, 6, 7.

**Interfaces produced:** `impliedProbability`, `fairOdds`, `probabilityEdge`, `expectedValue`, `proportionalNoVig`, `GeneratePrediction`, experimental model/calibration contracts.

- [ ] Write failing exact-string unit tests for implied probability, fair odds, edge, EV, and proportional no-vig examples.
- [ ] Implement pure calculations using only decimal value objects.
- [ ] Write failing prediction tests proving future-received observations are excluded at feature cutoff.
- [ ] Implement deterministic experimental model and identity calibration adapters with structured reason factors.
- [ ] Implement prediction use case: quality gate, contemporary price selection, calculation, atomic immutable persistence, and input lineage.
- [ ] Add null-metric prediction persistence for insufficient-data outcomes.
- [ ] Implement prediction worker consumer with idempotent job completion.
- [ ] Verify maturity is `EXPERIMENTAL` and every prediction resolves complete trace metadata.
- [ ] Commit as `feat: add traceable experimental predictions`.

**Tests:** Exact arithmetic; no-vig sum; cutoff leakage prevention; immutability; version trace; insufficient-data output; worker retry/idempotency.

**Acceptance criteria:** Eligible scenarios contain exact value metrics and structured reasons; ineligible scenarios contain explicit refusal status and no invented numeric outputs; all source observations are traceable.

## Milestone 9: EDGE and RADAR development heuristics

**Goal:** Calculate transparent, explicitly unvalidated EDGE and RADAR results from observable evidence.

**Files/packages affected:** `packages/analytics/src/{edge,radar}`; application use cases; database repositories; prediction worker consumers.

**Database changes:** Runtime inserts into score results and RADAR evidence; seeded definition versions remain `DEVELOPMENT_HEURISTIC`.

**Dependencies:** Milestones 6–8.

**Interfaces produced:** `calculateEdge`, `calculateRadar`, `CalculateEdge`/`CalculateRadar` use cases, typed component/evidence DTOs.

- [ ] Write failing EDGE tests for component values, weights, caps, penalties, and recommendation independence.
- [ ] Implement the versioned development formula from persisted definition metadata.
- [ ] Write failing RADAR tests for opening/current selection, movement, velocity, consensus/coverage, stale evidence, and divergence.
- [ ] Implement RADAR using observable odds only and typed decimal calculations.
- [ ] Add a contract test proving no score/evidence DTO or table exposes money/volume fields.
- [ ] Persist score definitions, results, evidence links, quality, and reason codes append-only.
- [ ] Add job consumers and deterministic recalculation behavior that creates new versioned results rather than updates.
- [ ] Verify the scenario matrix includes strong EDGE, RADAR move, and EDGE disappeared examples.
- [ ] Commit as `feat: add explainable EDGE and RADAR heuristics`.

**Tests:** Formula boundaries; evidence selection; stale/coverage penalties; metadata completeness; prohibited-claim schema check; immutability.

**Acceptance criteria:** Every score exposes its inputs/weights/caps/reasons and development status; RADAR traces opening/current/supporting quotes; no result claims actual money flow.

## Milestone 10: Authentication, authorization, and BFF contracts

**Goal:** Expose stable customer/admin queries through authenticated and permission-checked use cases.

**Files/packages affected:** `packages/auth`; application authorization/use cases; `packages/contracts/src/api`; web/admin BFF modules and route handlers.

**Database changes:** Test users and role grants only in local/test seeds.

**Dependencies:** Milestones 4, 6–9.

**Interfaces produced:** `Principal`, `PermissionCode`, `hasPermission`, entitlement-port placeholder, customer/admin response DTOs, stable problem-detail errors.

- [ ] Write failing authorization tests for anonymous, customer, another customer, admin, and missing individual permissions.
- [ ] Implement database-backed permission checks and request-scoped principals; do not trust client claims.
- [ ] Write failing API contract tests for decimal strings, message keys, synthetic labels, trace metadata, and problem details.
- [ ] Implement Today, Match Intelligence, and odds-history query use cases and handlers.
- [ ] Implement admin provider-run, prediction-trace, score, quality, and audit handlers with per-use-case permissions.
- [ ] Add server-side input parsing, request IDs, and structured logging.
- [ ] Run RLS, application authorization, and API integration suites.
- [ ] Commit as `feat: expose secure VELYQ BFF contracts`.

**Tests:** Permission matrix; ownership boundaries; route input validation; decimal serialization; no internal/provider payload leakage; stable error mapping.

**Acceptance criteria:** Customer routes reveal only approved synthetic intelligence; normal users receive denial from every admin endpoint; removing one admin permission denies only its protected operation.

## Milestone 11: VELYQ design system and customer vertical slice

**Goal:** Deliver the premium, responsive customer journey without embedding calculations in UI code.

**Files/packages affected:** `packages/ui`; `apps/web/app`; i18n/formatting modules; Playwright and component tests.

**Database changes:** None.

**Dependencies:** Milestone 10.

**Interfaces consumed:** Today/Match/odds-history DTOs; message keys; canonical decimal strings.

- [ ] Create visual tokens and component tests for typography, surfaces, status badges, data tables, metric displays, and charts.
- [ ] Implement the responsive authenticated shell and English message catalog through an i18n interface.
- [ ] Write failing route tests for sign-in protection and synthetic-data labeling.
- [ ] Implement sign-in, Today, Edge, Radar, Match Intelligence, and Account routes.
- [ ] Build Match Intelligence sections in the exact order defined in Design Section 15.2.
- [ ] Ensure all percentages/odds/dates format at the presentation boundary without calculation.
- [ ] Add loading, empty, stale, missing-lineup, insufficient-data, error, and required recommendation states.
- [ ] Run accessibility checks, mobile/desktop visual snapshots, component tests, and the customer E2E path.
- [ ] Commit as `feat: deliver customer intelligence vertical slice`.

**Tests:** Route protection; synthetic banner; required state rendering; keyboard navigation; contrast/accessibility; responsive layouts; E2E sign-in → today → match.

**Acceptance criteria:** A signed-in user completes the success journey; every required status can be viewed from seeded scenarios; heuristic/maturity labels and timestamps remain visible; no dead navigation ships.

## Milestone 12: Minimal traceability admin

**Goal:** Prove operational traceability and authorization without broad CRUD screens.

**Files/packages affected:** `apps/admin`; shared UI primitives; admin BFF consumers; audit use case/tests.

**Database changes:** Runtime append-only audit reads/events; no new schema.

**Dependencies:** Milestones 10–11.

**Interfaces consumed:** Admin provider-run, prediction-trace, score, quality, and audit DTOs.

- [ ] Write failing admin route tests for unauthenticated, normal-user, partially permitted, and admin principals.
- [ ] Implement protected admin shell and operational summary.
- [ ] Implement provider-run list/detail with counts, versions, hashes, errors, and observation links.
- [ ] Implement prediction trace with model/calibration/cutoff/price/input lineage.
- [ ] Implement EDGE/RADAR score and quality inspection views.
- [ ] Implement read-only audit page and record admin inspection events where policy requires.
- [ ] Run admin accessibility, authorization, and E2E trace tests.
- [ ] Commit as `feat: add authorized traceability admin`.

**Tests:** Server authorization per permission; trace completeness; audit append-only behavior; normal-user denial; admin E2E provider run → prediction → score/quality.

**Acceptance criteria:** An authorized admin traces any featured result to its run and observations; permission denial is enforced server-side; there are no general-purpose CRUD screens.

## Milestone 13: Deployment, operations, and final acceptance

**Goal:** Make the vertical slice reproducible in local, CI, preview, staging, and Vercel build environments.

**Files/packages affected:** GitHub Actions; Vercel project docs/config; operational runbooks; root README; observability dashboards/query docs.

**Database changes:** Validate staging migrations and seeds; no new tables without a reviewed amendment.

**Dependencies:** Milestones 1–12.

**Interfaces produced:** Deployment checklist, rollback/runbook, environment matrix, canonical replay command, acceptance report.

- [ ] Add migration-reset and RLS/integration services to CI; ensure no stage silently skips.
- [ ] Configure separate web/admin Vercel build roots and preview environment schemas.
- [ ] Document Supabase local/staging/production separation and direct-versus-pooled connection usage.
- [ ] Add health/readiness checks for web, admin, database access, and local worker consumers.
- [ ] Add structured operational queries for failed provider runs, stale observations, job backlog, and prediction failures.
- [ ] Run a clean-machine local setup rehearsal from README instructions.
- [ ] Run the complete CI-equivalent suite and capture exact passing commands/results.
- [ ] Execute every acceptance criterion in Design Section 22, including prohibited-claim and synthetic-label checks.
- [ ] Review dependency advisories, database advisors, bundle output, and secrets scan.
- [ ] Commit as `chore: harden Phase 1 delivery pipeline`.

**Tests:** Full unit/contract/integration/RLS/API/UI/E2E suite; clean build; migration reset; environment validation; smoke/health checks.

**Acceptance criteria:** All 15 design acceptance criteria pass with recorded evidence; both apps are Vercel-ready; migrations promote independently; local setup and deterministic replay work without external provider credentials.

## Milestone dependency sequence

```text
1 Workspace
 ├─> 2 Decimal ─> 3 Market semantics ─┐
 └────────────────> 4 Database ───────┤
                                      ├─> 5 Provider ─> 6 Ingestion ─> 7 Quality
                                      │                              └─> 8 Prediction
                                      │                                   └─> 9 EDGE/RADAR
                                      └────────────────────────────────────────> 10 Auth/BFF
                                                                                  ├─> 11 Web
                                                                                  └─> 12 Admin
                                                                                       └─> 13 Delivery
```

Review gates occur after every milestone. A schema, public contract, market-identity, decimal, provider-policy, or authorization change requires explicit design review before dependent milestones continue.

## Plan acceptance checklist

- [ ] Each design requirement maps to at least one milestone.
- [ ] Each milestone has an independently testable deliverable and commit.
- [ ] Schema creation is limited to the exact Phase 1 table allowlist.
- [ ] Exact decimal, canonical market, provenance, rights, and append-only rules precede product UI.
- [ ] Synthetic scenarios cover every required recommendation state.
- [ ] Customer and admin authorization tests precede UI completion.
- [ ] The final milestone verifies every design acceptance criterion rather than relying on manual browsing alone.

## Decisions required before execution

1. Approve `decimal.js` as the exact arithmetic library.
2. Approve the exact Phase 1 table allowlist and the deferred target-table list.
3. Approve Phase 1 lineup snapshots as JSON rather than normalized player rows.
4. Approve BFF-only access to catalog/market/intelligence data in Phase 1.
5. Approve Phase 1 settlement execution for full-time 1X2 and Over/Under 2.5 only.
6. Approve entitlement interfaces without billing/plan tables in Phase 1.
7. Approve fictional provider/bookmaker/team identities and persistent synthetic labels.
8. Approve the database-backed job port with optional Supabase Queues adapter.
9. Select whether implementation will use subagent-driven milestone execution or inline execution after approval.
