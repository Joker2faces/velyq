# Claude football premium V2 — handoff to Codex

Branch: `claude/football-premium-v2`
Base: `origin/claude/premium-ux-review` @ `d94f704969a1b98e904966b983aac3b63bd2a801`

Scope was the customer product experience: football visual identity, native
Greek copy, information hierarchy, pricing presentation. No schema, RLS, auth
authority, entitlement authority, Stripe webhook or domain arithmetic was
touched.

---

## 1. Visual identity

**Palette.** The V1 mint/blue palette read as crypto. V2 is a pitch identity:
emerald primary (`--pitch`) on a charcoal ground with a green cast, teal-cyan
(`--signal`) reserved strictly for market and data intelligence, gold
(`--gold`) for premium and attention states only. Colour variables and tone
modifiers were renamed with it, so nothing still says "mint" while rendering
emerald, and tone names are semantic (`caution`, `market`, `negative`) rather
than hue names.

**One motif, reused.** The pitch coordinate system: `.pitch-field` (marking
grid), `.pitch-arc` (centre circle behind the hero), `.pitch-corner` (corner
arc on premium cards), `.touchline` (section divider). All decorative and
`aria-hidden`.

**Typography.** The single biggest "less terminal" change: monospace was on
eyebrows, badges and every metric caption. It is now reserved for numerals —
odds, timestamps, trace identifiers — with a tracked sans label face taking
the rest. 18 selectors moved.

**The EDGE axis** is the signature analytic visual and the one picture that
carries the product argument: a single 0–100% probability scale with the
market's implied probability and the model's probability marked on it, and
the span between them shaded. The reader sees the gap rather than subtracting
two percentages. Used on Home, EDGE and Match Intelligence.

Nothing was added from a charting dependency; every visual is inline SVG or
CSS.

## 2. Greek

The V1 Greek was machine-translated in effect, and was rejected. 201 strings
were rewritten by a native-copy review, then re-read independently in Greek
only. Systematic fixes:

| Was | Now | Why |
|---|---|---|
| «επικαιρότητα» | when the price was last recorded | the word means "current affairs" |
| «σύνθεση» | «ενδεκάδα» | what Greek football actually says |
| «τεκμαρτή πιθανότητα» | «πιθανότητα αγοράς» | the first is academic |
| «σύσταση» | «πρόταση» | stiff, and nudges toward an instruction |
| «συνεδρία» | «σύνδεση» | reads as a medical appointment |
| «διακομιστές», «ποντραρίσματος» | plainer forms | dated / slangy |

The second Greek-only pass then found three leaks that no catalog review could
have caught, because none came from the catalog: the page `<title>` was a
static English metadata export; market selections rendered the raw DTO value
("Home", "Draw", "Away"); and `syntheticLabel` is English metadata on the DTO
that was being rendered straight into a badge. All three fixed.

Three tests now guard the register — banned terminology, NO_BET never phrased
as betting advice, and the Greek question mark. A scanner
(`greek-leaks`, run ad hoc) confirms the only Latin text remaining on Greek
pages is the creator credit, brand and product names, "Stripe price IDs" and
trace version strings.

Compliance strings keep every negation intact. They were shortened only by
removing padding, never weakened.

## 3. Pricing now reads the real entitlement matrix

`planCatalog` calls `resolveCustomerEntitlements` from `@velyq/auth` — the same
function the authenticated app uses — instead of carrying hand-written feature
lists. The page therefore cannot advertise access the server does not grant,
and cannot drift.

On this branch ELITE resolves to the same entitlements as PRO, so the ELITE
card automatically renders "grants the same intelligence access as the tier
below it today". **You have already fixed this** in `53e59a9 fix: distinguish
pro and elite customer entitlements` on `codex/backend-hardening`; once that
merges, the card flips to the ELITE copy and marks ELITE's added entitlements
with no copy change needed.

## 4. Verification

- `pnpm format` — pass
- `pnpm lint` — pass
- typecheck, all 17 packages — pass
- `pnpm test` — 338/339. The one failure is
  `packages/providers/test/built-artifact.test.ts` (and intermittently
  `packages/database/test/vercel-export-regression.test.ts`), which spawn
  `corepack pnpm build` inside a 5 s timeout; turbo cannot resolve its package
  manager binary in this sandbox. Both fail identically on the base commit and
  on `adff73a`. Neither file was touched.
- `next build --webpack` — pass, 30 routes
- `node tooling/scripts/ux-sweep.mjs` — **OK, 90 route/viewport/locale
  combinations clean** (15 routes × 390/768/1440 × EN/EL), checking horizontal
  overflow, tap-target height, minimum font size, WCAG text contrast,
  landmarks, `h1` count, labelled inputs and resolved `lang`.

## 5. Conflict report against your branches

Checked at `origin` as of this branch's creation, then re-checked at push
time. `codex/backend-hardening` advanced from `d479ec6` to `614cffc` while
this work was in progress; the added commit (`chore: align Supabase migration
versions`) touches only `supabase/migrations/**` and has **zero intersection**
with our file set, so the analysis below still holds.

- **`origin/codex/backend-hardening` == `origin/integration/phase-1`
  (`614cffc`) already contains our V1 work** (`ea73d87 merge: integrate
  reviewed premium UX`). Its only change to our V1 file set was
  `apps/web/app/plan-config.ts`.
- **Rebase or merge V2 onto `codex/backend-hardening`, not onto
  `codex/data-semantics`.** Merging `data-semantics` directly would conflict
  hard on six files: it adds ~90 lines of formatter body into
  `packages/ui/src/index.ts`, which we reduced to a re-export barrel over
  `locale.ts` / `format.ts` / `messages.ts` / `domain-labels.ts`, and it edits
  the four page components we rebuilt.
- `codex/deployment-hardening` and `codex/quality-infrastructure` have **zero
  file intersection** with our work.
- `origin/main` and `origin/integration-to-main` are strictly behind
  `adff73a`.

**V2 touches `apps/web/app/plan-config.ts`.** That is the one file where your
`backend-hardening` change and ours meet. Ours replaces the hand-written
feature lists with derivation from `@velyq/auth`; yours adds
`billingPriceConfiguration` and rewires `paidBillingConfigured()`. The two are
compatible — ours does not touch `paidBillingConfigured` beyond leaving the
existing implementation in place — but the merge needs a human read, because
both edit the same small file. Take your `paidBillingConfigured` /
`billingPriceConfiguration` wholesale and keep our `planCatalog`.

**One thing you may want to recheck on your own branch, unrelated to V2:**
`apps/web/app/scenario-status.ts` survives in your merge and is unit-tested,
but no page imports it — `ScenarioStatus` matches only its own file and its
test under `apps/web`. The UI wiring from `codex/data-semantics` appears to
have been dropped when our page rewrite won that merge.

## 6. Items Codex must review

1. `apps/web/app/plan-config.ts` — the one genuine merge point (see above).
2. `apps/web/next.config.mjs` still carries the V1 webpack `extensionAlias`
   for `@velyq/ui`'s TypeScript-source export. Unchanged in V2.
3. `packages/auth` is **not** modified by V2. The ELITE/PRO fix stays yours.
4. Entitlements are still not enforced anywhere — `hasCustomerEntitlement` has
   no call sites, so a FREE user sees the full EDGE table, full RADAR and every
   Match Intelligence page. The pricing UI is now honest about what each tier
   *grants*, but there is still no paywall. Authorization behaviour, so out of
   scope for us both times.
5. e2e specs remain stale against the new markup and were already stale before
   V1. Snapshot baselines have to be regenerated on your runner.
6. Greek gambling-regulation specifics (age limit, ΕΕΕΠ, helpline 1114) are
   still deliberately not asserted — jurisdiction undecided. Compliance strings
   are marked `COMPLIANCE` in `packages/ui/src/messages.ts`.
7. No dependencies were added in V2. `package.json` and `pnpm-lock.yaml` are
   untouched.

## 7. Prohibited-claim check

No occurrence of guaranteed win, sure bet, guaranteed profit, 100% prediction,
risk-free betting, verified sharp money, money volume or bet handle, in either
language. Every mention of money flow is an explicit denial that VELYQ observes
it. The Greek rewrite strengthened rather than softened those denials.
