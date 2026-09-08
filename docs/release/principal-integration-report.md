# Principal integration report

Reconciliation of three parallel lines of work onto one reviewable branch.

## Sources

| Role | Branch | SHA |
| --- | --- | --- |
| Safe base (runtime architecture) | `cloudflare/velyq-poc` | `3bd0a46b1786e64be673628847ccfba352c79e5a` |
| Integration branch | `claude/velyq-principal-integration` | this branch |
| Intelligence engine (reviewed, not merged) | `codex/intelligence-engine-release` | `c87fd4ebff6cb651f37a7eedb8c5b1a8a62c2077` |
| Real-data pipeline (reviewed, not merged) | `codex/intelligence-completion-v2` | `1a26951fedd3610fcc264fb0136b736db1ef68ae` |

### Preservation

`codex/intelligence-engine-release` had **38 local commits that existed on no
remote**, and it had genuinely diverged — the remote also carried one commit
(`a8d0629`) that the local branch lacked, so a push would have been rejected
and a force-push would have destroyed it.

The local tip is now protected at:

```
refs/backups/codex-intelligence-engine-release-20260908 -> c87fd4e
```

Pushed to a ref **outside `refs/heads/*`** on purpose. Both Vercel projects are
configured to deploy every branch in this repository (verified via the
projects API: `deploymentEnabled` unset, production branch `main`), so a
backup *branch* would have triggered two preview deployments. A non-branch ref
protects the objects and the GitHub integration ignores it.

The original branch was not moved. All six named commits — `3e7ec9a`,
`156791f`, `5e06fc2`, `369b27c`, `9b1d145`, `1cbf9d8` — are reachable from the
backup ref.

## Port decisions

Nothing was merged. Each change was classified on its own merits.

| Change | Decision | Reasoning |
| --- | --- | --- |
| `packages/decimal` numeric canonicalisation + `roundToScale` | **PORT** | Fixes a defect independently reproduced on the base branch. |
| `calculateValue` rounding | **REIMPLEMENT** | Base already owns this function; completion-v2's approach applied to the base's own implementation. |
| Engine `price.ts` | **REJECT + REIMPLEMENT** | Duplicated `calculateValue`; four defects (see below). Its genuinely new ideas were rebuilt on the existing primitive. |
| Engine `369b27c` lint project cap | **PORT** | Raising a documented performance guardrail is its sanctioned use. |
| Live data label | **PORT (contract widened)** | Base was structurally synthetic-only. |
| Vitest `workers/*` discovery | **REIMPLEMENT + guard** | completion-v2 fixed the glob; a permanent guard test was added here. |
| Vercel-first deployment behaviour | **REJECT** | Cloudflare remains the customer host. Nothing in this branch deploys to Vercel. |
| Production migrations 12–22 | **KEEP IN PLACE, NOT RE-APPLIED** | Already applied to production; verified read-compatible. No schema change made from this branch. |
| Serie A identity fix | **NEEDS REVIEW — not ported** | See "Known gaps". |
| Team alias resolver fix | **NEEDS REVIEW — not ported** | See "Known gaps". |

### Why the engine's `price.ts` was rejected

Reviewed line by line. The **arithmetic is correct** — all four reference
figures in the product's own worked example reproduce exactly. But:

1. `fairOdds` and `minimumOdds` returned the same value under two names,
   inviting a reader to treat break-even as an acceptable price.
2. No `MARGINAL` state, so +0.2% expected value was reported as `ATTRACTIVE`.
   With an EXPERIMENTAL model that has so far only matched the market, that is
   noise presented as opportunity.
3. `createPriceSensitivity` reported `movement` between consecutive rungs of a
   hypothetical ladder — an artifact of the caller's array order, not market
   movement, and sharing a name with the real RADAR concept.
4. `MODEL_MATURITY` was a hardcoded module constant typed as its own literal,
   so the field could never express a promoted model.

`packages/analytics/src/price-validity.ts` rebuilds the useful parts on top of
the base's existing `calculateValue`.

## Defects found and fixed on the base branch

These were latent in `cloudflare/velyq-poc`, not inherited from either Codex
branch.

**P0 — the value engine could not price a real market.** `calculateValue`
failed on six of seven realistic prices. Inputs arrive scale-padded from
`numeric(18, 8)` (`"2.10000000"`) and were rejected as non-canonical; outputs
are unbounded quotients (`1 / 3.9` is thirty digits) and were rejected as out
of range. `edge` and `expectedValue` were null for everything except tidy
prices like 2.00 at an even 50% — the shape of a test fixture. The suite was
green while the product could not compute value.

**P0 — real football was about to be labelled demo data.** `syntheticLabel`
was hardcoded, and the DTO type made any other value impossible. Production
now holds 450 real fixtures and 679 real odds observations.

**P1 — `EDGE_DISAPPEARED` claimed a history that never happened.** Returned
whenever no edge was present, so every match the model disliked was reported
as a withdrawn recommendation.

**P1 — a whole worker suite never executed.** `workers/` was absent from the
Vitest include list. Enabling it surfaced a stale assertion that had been
wrong for as long as the glob was.

## Production database compatibility

Read-only verification against project `zvdqkmevjfwprexshpap`.

- Migration ledger: **22 applied**. This branch's `supabase/migrations` holds
  the first **11**, which are a byte-identical prefix.
- All **35 tables** this branch's schema allowlist expects are present.
- The 11 extra migrations are additive except one constraint replacement
  (`events_phase_one_synthetic_check` → `events_synthetic_boolean_check`,
  widening) and several `revoke ... from anon, authenticated`.
- Those revokes do **not** affect this application: it reaches Postgres
  through Hyperdrive with a privileged role, not through PostgREST's
  `anon`/`authenticated` roles.

**Verdict: production data is read-compatible with this branch.** No schema
change was made from here, and none is required to read current production.

## What this branch does not do

- **No production writes.** No migration applied, no row inserted or updated.
- **No deployment.** Nothing pushed to Cloudflare or Vercel.
- **No provider calls.** API-Sports quota was at 21/100 at handover, below the
  25% reserve.
- **No secret changes.** Names inspected only.

## Known gaps

Carried forward, with the evidence that exists:

- **Competition identity (Serie A).** completion-v2 repaired a real production
  defect — a Brazilian Série A fixture mapped to `ITA_SERIE_A` via name-slug
  matching — and moved identity onto provider league ids. That work is sound
  and should be ported, but it lives in ingestion code this branch does not
  yet carry. Production itself is already repaired.
- **Team alias resolution.** Same situation: the fix is real, the code path is
  in the prediction cycle.
- **Ingestion, lineup and settlement pipelines.** Present on completion-v2,
  absent here by design — porting them means porting the Vercel coupling too,
  which needs a deliberate hosting decision first.

## Rollback

Every change is additive to a clean base.

- Base is `3bd0a46`; `git diff 3bd0a46..HEAD` is the complete change set.
- No migration was applied, so there is nothing to reverse in the database.
- No deployment was made, so the live Worker is untouched.
- Reverting any single commit is safe: none depends on a schema change.
