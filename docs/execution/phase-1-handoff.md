# VELYQ Phase 1 handoff

## Resume point

- Branch: `feat/phase-1-foundation`
- Last approved milestone: Milestone 4 at `acbde23`
- Milestone 5 implementation: `7dc9b21` (review rejected; not complete)
- The next commit is a WIP checkpoint preserving the interrupted Milestone 5 fix round.
- Do not merge or deploy this branch as production until the fix round, independent review, and full verification pass.

## Milestone 5 review findings still being fixed

1. Copy/bundle repository JSON fixtures into the built provider artifact and prove the built CLI can replay them.
2. Inject trusted environment, territory, and time policy context; authorize both cache/retention and replay operations.
3. Remove aliases to cached fixture state through immutable internals and defensive outputs.
4. Expose distinct source-fixture and normalized-output hashes.
5. Make seeded provider runs, source observations, normalized values, IDs, hashes, schema versions, timestamps, and counts exactly match replay output.
6. Parse public policy and mapping inputs from `unknown` or require opaque validated immutable values.
7. Ground every scenario state in an identifiable event/market scenario record.
8. Preserve complete provenance for quarantined observations and expose rejections through the odds source contract.
9. Validate lineup player identities against the fictional synthetic catalog before applying synthetic labels.

## Resume workflow

1. Pull and check out `feat/phase-1-foundation`.
2. Read `docs/superpowers/specs/2026-09-03-velyq-phase-1-design.md` (authoritative) and `docs/superpowers/plans/2026-09-03-velyq-phase-1.md`.
3. Inspect the WIP checkpoint diff from `7dc9b21`; continue the existing red/green cycle rather than restarting it.
4. Complete all nine findings, run focused tests, then `corepack pnpm verify`, built-artifact replay, seed parity, frozen install, audit, schema no-drift, and database gates where Docker is available.
5. Commit the completed fix as `fix: harden governed provider replay`.
6. Request a fresh independent Milestone 5 review and fix every High/Important finding before starting Milestone 6.

## Known environment limitation on the source machine

Docker CLI was unavailable. Migration execution, seed execution, pgTAP/RLS behavior, database lint, and database advisors were therefore not live-verified. Static schema/migration checks passed through Milestone 4.
