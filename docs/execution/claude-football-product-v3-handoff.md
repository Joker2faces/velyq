# Claude football product V3 — handoff to Codex

Branch: `claude/football-product-v3`
Base: `origin/integration/phase-1` @ `614cffc8197246087b8d756514c753c79ca45e5e`

Built directly on the current integration branch, then merged the V2 design
work (`origin/claude/football-premium-v2`) into it. That merge produced exactly
one conflict — `apps/web/app/plan-config.ts` — resolved in favour of your
`billingPriceConfiguration` plus our derived `planCatalog`.

No schema, RLS, migration, auth authority, permission, Stripe webhook,
subscription authority or server-side entitlement was modified.

---

## 1. The data bug you flagged, and its actual cause

You reported `2.10 → 1.85` rendering as `-0.1%`. Confirmed, root-caused and
fixed.

`movementPercent` **changed unit** between the branch our previous UX work was
built on and current integration. It used to be stored in percentage points
(`-11.904…`); `40964e4 fix: harden customer data semantics` moved it to a
ratio (`-0.119…`). Your own test states the new contract:

```
it("stores price movement as ratios for percent formatting", ...)
```

Our presentation layer was still the percentage-point one, appending `%` to
the raw value — hence `-0.1%`. It now goes through `formatPercent`, which
scales exactly once. We did **not** invent a presentation-only semantic; we
matched the canonical DTO.

A second unit error was corrected at the same time. Probability edge is the
difference of two probabilities, so it is percentage points, not percent:
60.0% against 54.1% is **+5.9 pp**, not +5.9%. Rendering it as a percentage
invites confusion with expected value, which genuinely is one. The unit label
is localized — Greek writes «μον.», never "pp".

`apps/web/test/data-presentation.test.ts` now checks every visible figure
twice: derived correctly from its own row, and rendered as the exact string.

| Figure | Rule | Fixture row 1 |
|---|---|---|
| Implied probability | `1 / odds` | 1.85 → 54.1% |
| Fair odds | `1 / p` | 60% → 1.67 |
| Probability edge | `p − implied` | +5.9 pp |
| Expected value | `p × odds − 1` | +11.0% |
| Movement | `current / opening − 1` | 2.10 → 1.85 = −11.9% |

Probabilities render unsigned, deltas signed, odds always two decimals,
missing values as an em dash.

## 2. Football identity

The previous pass had emerald tokens and a square grid and still read as a
dark analytics dashboard. Three changes fix that, and they are the reason the
product is now recognisable as football within a second:

- **The headline names the domain.** "Read the football market before it
  moves", with the brand tag "Football intelligence".
- **The backdrop is a real pitch.** `PitchBackdrop` draws touchline, halfway
  line, centre circle, penalty areas, penalty spots and corner arcs to actual
  pitch proportions — not a generic grid.
- **Two teams are a fixture, not a table row.** `Fixture` sets home and away
  either side of a divider echoing the halfway line, with competition,
  kick-off and market beneath.

The **EDGE axis** remains the signature analytic visual: one 0–100%
probability scale carrying market and model, with the gap between them shaded.

Monospace is confined to numerals. No charting or animation dependency was
added; every visual is inline SVG or CSS.

## 3. Admin console

Rebuilt on the shared foundation. Tokens, reset and primitives moved into
`@velyq/ui/tokens.css`, imported by both apps, so the two surfaces cannot
drift. Admin leads with the analytical cyan and carries no pitch motif.

Navigation is grouped and lists **only routes that exist**: overview, provider
runs, predictions, scores, audit. `quality` has a detail route but no index,
so it is reachable from an assessment and is deliberately not a menu entry.

The data-bearing detail pages keep their query logic untouched — their old
class names are mapped onto the new system in a compatibility layer rather
than rewriting working pages to rename them. The dashboard is rebuilt and
renders only figures the runtime returns, with a real empty state.

Operational tables become stacked cards below 60rem, labelled from their
column headers.

## 4. Greek

The catalog was rewritten as native copy in the previous pass and reviewed
again here. Terminology in force: «ενδεκάδα» not «σύνθεση», «πιθανότητα
αγοράς» not «τεκμαρτή», «πρόταση» not «σύσταση», «μον.» not "pp". NO_BET stays
«Χωρίς πρόταση» — a model state, never an instruction.

Four tests guard the register (banned terminology, NO_BET phrasing, the Greek
question mark, complete coverage). A scanner confirms the only Latin text left
on Greek pages is the creator credit, brand and product names, "Stripe price
IDs" and trace version strings.

## 5. Verification

- `pnpm format` — pass
- `pnpm lint` — pass
- typecheck, all packages plus both apps — pass
- `pnpm vitest run` — **372 / 373**. The single failure is
  `packages/providers/test/built-artifact.test.ts`, which spawns
  `corepack pnpm build` inside a 5 s timeout; turbo cannot resolve its package
  manager binary in this sandbox. It fails identically on `614cffc` with no
  changes applied. The file was not touched.
- `next build` — customer and admin, both pass
- `node tooling/scripts/ux-sweep.mjs` — **OK, 240 route/viewport/locale
  combinations clean**: 20 routes (15 customer, 5 admin) × 390/430/768/1024/
  1440/1920 × EN/EL, checking horizontal overflow, in-card clipping,
  tap-target height, minimum font size, WCAG text contrast, landmarks, `h1`
  count, labelled inputs and resolved `lang`.

Note that `pnpm test` now shells out to a turbo build before vitest and fails
here for that reason; `pnpm vitest run --config tooling/vitest/vitest.config.mts`
is the result above.

## 6. What we changed outside the UI, and why

Three items, all small, all deliberate:

1. **`apps/web/app/plan-config.ts`** — the merge point. Your
   `billingPriceConfiguration` and `paidBillingConfigured` are kept verbatim.
   `planCatalog` now derives feature lists from `resolveCustomerEntitlements`
   rather than hand-written copy, so the page cannot advertise access the
   server does not grant. Your `53e59a9` change flowed through automatically:
   ELITE now shows Match Intelligence as its addition over PRO, with no copy
   edit. Fourteen now-redundant message keys were removed, including
   `planProFeature4`, which claimed Match Intelligence for PRO and had become
   false.

2. **`tooling/e2e/customer-test-helpers.ts`** — stale constant. It still used
   the `73000000` event prefix after the fixture moved to `76000000`, so any
   e2e run opening a match was landing on the not-found state. One-line fix.

3. **`apps/admin/package.json` / `next.config.mjs`** — admin gains a
   `workspace:*` dependency on `@velyq/ui` (no third-party package), plus
   `transpilePackages` and the same webpack `extensionAlias` the customer app
   already carries, because `@velyq/ui` is consumed as TypeScript source under
   a NodeNext baseline.

## 7. Items Codex must review

1. `apps/web/app/plan-config.ts` — the only file both teams edited.
2. The `extensionAlias` now exists in **both** next configs. The alternative
   remains building `@velyq/ui` to `dist` and pointing its export there.
3. `@velyq/ui` gained a second export, `./tokens.css`. Both apps import it.
4. Entitlements are still not enforced — `hasCustomerEntitlement` has no call
   sites, so a FREE customer still reaches the full EDGE table, full RADAR and
   every Match Intelligence page. The pricing UI is now honest about what each
   tier *grants*, but there is no paywall. Authorization behaviour, so out of
   scope for us.
5. `apps/web/app/scenario-status.ts` is still unused: no page imports
   `ScenarioStatus`. We deliberately did not wire it in — `scenario.label`
   duplicates the recommendation and is English-only, so surfacing it would
   put untranslated text on Greek pages. If you want it, it needs a localized
   label or a mapping through the catalog.
6. e2e specs still assert the previous markup and will need updating; snapshot
   baselines must be regenerated on your runner.
7. Greek gambling-regulation specifics (age limit, ΕΕΕΠ, helpline) remain
   deliberately unasserted pending a jurisdiction decision. Compliance strings
   are marked `COMPLIANCE` in `packages/ui/src/messages.ts`.

## 8. Limits of this pass

**Admin data pages were not visually verified with live rows.** The admin
console reads a real database, and this environment has no Docker, so no local
Postgres. Every admin route was exercised at six viewports in both locales and
renders its authorization gate correctly, and both admin builds and typechecks
pass — but the populated tables, and the detail pages under provider runs,
predictions, scores and quality, have been verified by build and by code, not
by eye. Worth a look on your side once a database is attached.

**No preview deployment.** No Vercel CLI, no `.vercel` project link and no
token are available in this environment, so no preview URL exists for this
branch. If the repository has the Vercel Git integration enabled, the push
will have produced one automatically.

## 9. Codex drift check

Re-fetched at push time: `origin/integration/phase-1` is still `614cffc`, the
SHA this branch was built from. **No new Codex commits to reconcile.**

## 10. Prohibited-claim check

No occurrence, in either language, of guaranteed win, sure bet, guaranteed
profit, 100% prediction, risk-free betting, verified sharp money, money volume
or bet handle. Every mention of money flow is an explicit denial that VELYQ
observes it.
