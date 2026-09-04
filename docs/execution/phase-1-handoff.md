# VELYQ Phase 1 handoff

## Current resume point — 2026-09-05

- Branch: `feat/phase-1-foundation`.
- Remote checkpoint before the M13 docs commit: `fba8748`.
- Milestones 1–12 have implementation checkpoints, but Phase 1 final
  acceptance is **not complete**.
- M13 operational documentation now covers the environment matrix, local and
  CI verification, migrations, owner bootstrap, staging seed, replay,
  deployment, rollback, limitations, and read-only diagnostic queries.
- Do not merge or promote to production until all blocked/unverified rows in
  [acceptance-evidence.md](./acceptance-evidence.md) have current evidence and
  an independent review approves the release.

The working tree contained unrelated pre-existing changes when M13 docs were
prepared. They are not part of the operational-docs commit.

## M13 operator entry points

1. Read [the operations runbook](../operations/phase-1-runbook.md).
2. Populate each target from the
   [environment matrix](../operations/environment-matrix.md).
3. Review the [known limitations](../operations/known-limitations.md).
4. Use the [read-only operational queries](../operations/queries/README.md)
   during smoke tests and incidents.
5. Update the [acceptance evidence ledger](./acceptance-evidence.md) with exact
   command, SHA, URL/run ID, timestamp, and result. Never convert a local pass
   into a CI or hosted-deployment pass.

## Immediate blockers

1. GitHub Actions run `33902045154` at `fba8748` did not start any of its nine
   jobs because GitHub reported that the account was locked due to a billing
   issue. A green CI-equivalent run does not exist for this checkpoint.
2. A Vercel deployment attempt encountered the platform rate limit. No
   independently verified customer/admin deployment pair or complete hosted
   smoke result is recorded for the current checkpoint. Wait for the quota
   window or obtain a limit increase; do not retry in a tight loop.
3. Production migration, owner bootstrap, seed, replay, readiness, rollback,
   and restoration remain procedural documentation, not executed acceptance
   evidence.

## Completion sequence

1. Resolve the GitHub billing lock and rerun CI at the intended release SHA.
   Confirm all nine jobs contain steps and pass; a one-to-three-second failed
   job with no steps is infrastructure failure, not test evidence.
2. After the Vercel limit clears, deploy both projects with matching environment
   scopes and record their URLs and `VERCEL_GIT_COMMIT_SHA` values.
3. Promote migrations independently, bootstrap the existing owner, and run the
   guarded seed only if staging sentinel tables are empty.
4. Execute health/readiness, staging Playwright smoke, owner admin trace,
   operational queries, deterministic durable replay, dependency audit,
   database advisors, and secrets scan.
5. Walk every Design Section 22 criterion and prohibited-claim boundary. Attach
   evidence per row in the ledger.
6. Request an independent review. Only then mark Phase 1 accepted and promote.

## Historical handoff record — retained, superseded

The prior handoff said the last approved milestone was Milestone 4 at
`acbde23`, Milestone 5 implementation `7dc9b21` was rejected, and nine provider
replay findings remained. That was the correct resume point at the time.

Those findings covered built-fixture bundling, trusted policy context,
immutability, separate source/normalized hashes, seed/replay parity, validated
policy inputs, scenario identity, quarantined provenance, and synthetic lineup
identity. The fix was subsequently checkpointed in `3148493` (`fix: harden
governed provider replay`), followed by later customer/admin and visual-test
checkpoints through `fba8748`.

The historical Docker limitation also remains relevant as historical evidence:
migration execution, seed execution, pgTAP/RLS behavior, database lint, and
database advisors were not live-verified on that earlier source machine. It is
not evidence about the current machine and must not be treated as a current
pass or failure.
