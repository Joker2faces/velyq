# Phase 1 acceptance evidence ledger

Status as of 2026-09-05. This ledger distinguishes source/test coverage from
executed acceptance. `Implemented` is not a release pass; `Blocked` and
`Unverified` keep Phase 1 open.

## External execution blockers

| Surface | Evidence | Result | Required follow-up |
| --- | --- | --- | --- |
| GitHub Actions | [Run `33902045154`](https://github.com/Joker2faces/velyq/actions/runs/33902045154), SHA `fba8748`, 2026-09-04 17:42:58Z; all nine jobs completed in 1–3 seconds with no steps | **Blocked:** GitHub annotation says the account is locked due to a billing issue | Resolve billing, rerun at release SHA, record green run URL and job results |
| Vercel | Deployment activity reached a platform request-rate limit; no durable deployment URL/result is recorded in this repository | **Blocked:** current customer/admin pair and hosted smoke are not proven | Wait for/reset quota or ask team owner/support; deploy once, record both URLs, SHAs, and smoke output |

## Design Section 22 criteria

| # | Criterion | Current evidence | Status / missing evidence |
| --- | --- | --- | --- |
| 1 | User authenticates and sees today's fictional fixtures | Auth/BFF routes, customer journey tests, synthetic seed | Implemented; hosted authenticated journey unverified |
| 2 | Visible price/provider/bookmaker labels are synthetic | UI/contracts and customer visual snapshots at `fba8748` | Local snapshot evidence; hosted visual check unverified |
| 3 | Match Intelligence shows historical/current odds and timestamps | Customer routes and journey/visual tests | Implemented; hosted journey unverified |
| 4 | Prediction shows version/maturity, probabilities, fair odds, EV, quality, reasons, cutoff | Contracts, seeded scenario, customer/admin views and tests | Implemented; staging data trace unverified |
| 5 | Core values round-trip PostgreSQL without JS `number` arithmetic | Decimal package rules plus database integration/pgTAP coverage | Source/test coverage exists; current database suite blocked in GitHub and not yet recorded locally for M13 |
| 6 | EDGE exposes version, `DEVELOPMENT_HEURISTIC`, components, weights, penalties, quality, reasons | Score schema, seeded data, EDGE UI/tests | Implemented; hosted visual/data trace unverified |
| 7 | RADAR exposes observation/window/bookmaker/evidence fields without volume claims | Radar schema, seeded data, RADAR UI/tests | Implemented; hosted prohibited-claim review unverified |
| 8 | Market semantics distinguish period/scope/line identities | Market-semantics package and database identity tests | Implemented; current CI pass blocked |
| 9 | Dataset demonstrates all required decision states | Seed plus customer scenario matrix tests | Implemented; hosted seeded dataset unverified |
| 10 | Admin traces result across full lineage | Admin APIs/views and authorization tests | Implemented; owner staging trace unverified |
| 11 | Normal user cannot access admin or another profile | Server authorization and RLS tests | Implemented; current pgTAP and hosted denial checks unverified |
| 12 | Replay is deterministic and idempotent | Provider/ingestion tests and unique replay identity | Implemented; durable staging replay twice at release SHA unverified |
| 13 | Append-only rules reject update/delete | Migration triggers and pgTAP tests | Implemented; current target execution unverified |
| 14 | Unit, contract, integration, RLS, API, UI, E2E pass in CI | Workflow defines nine non-skipping jobs | **Blocked:** latest GitHub run started no steps due to billing lock |
| 15 | Web/admin Vercel builds and local setup need no external provider key | Synthetic mode, app build scripts, local visual build at `fba8748` | Local/source evidence only; clean-machine rehearsal and current Vercel builds unverified |

## M13 gate ledger

| Gate | Exact evidence required | Status |
| --- | --- | --- |
| Clean-machine bootstrap | OS/tool versions, checkout SHA, `pnpm install --frozen-lockfile`, `pnpm verify` output | Unverified |
| Local E2E | `pnpm test:e2e` result and Playwright artifact location | Previous visual checkpoint exists; rerun at release SHA required |
| Local database | `pnpm db:verify` reset/list/pgTAP/lint/advisors output | **Blocked on this machine:** Docker CLI was not found on 2026-09-05 |
| Worker readiness | Built CLI replay ending `Worker readiness: PASS` | Implemented in CI; rerun at release SHA required |
| Dependency review | `pnpm audit` output with accepted exceptions and owner/date | Unverified |
| Secrets scan | Tool/version, command, SHA, findings | Unverified |
| Bundle review | Web/admin build output and unexpected bundle/server warnings | Unverified |
| Staging migration | Linked project ref (redacted), migration list, dry-run and push result | Unverified |
| Owner bootstrap/seed | Existing auth UUID (redacted), empty preflight, atomic seed result, ADMIN/USER query | Unverified |
| Durable replay | Same clock/sequence twice; run IDs, source and normalized hashes, duplicate counts | Unverified |
| Hosted readiness | Both deployment URLs and SHAs; four health/readiness HTTP results | Blocked by Vercel rate limit |
| Hosted smoke | Staging Playwright output plus owner trace and normal-user denial | Blocked by Vercel rate limit |
| Rollback rehearsal | Prior deployment IDs, traffic switch, restored health/readiness/smoke | Unverified |
| Independent review | Reviewer, SHA, date, findings disposition | Unverified |

## Evidence update rules

- Append the exact command, UTC timestamp, release SHA, target, and artifact/run
  URL to the relevant row or a dated subsection.
- Redact credentials, tokens, database hosts, owner UUIDs, and project refs.
- Record infrastructure failures as blocked, not failed tests.
- Record source inspection as implemented, not executed.
- Invalidate environment-specific evidence when its schema, data, configuration,
  or deployment SHA changes.
