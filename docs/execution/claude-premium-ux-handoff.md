# Claude premium UX branch — handoff to Codex

Branch: `claude/premium-ux-review`
Base: `origin/codex/velyq-premium` @ `adff73a24be43294b56b23ff39f0f20beb4327e2`

Scope was the customer product experience only: visual design, UX, bilingual
content, responsive behaviour, accessibility, information hierarchy, pricing
presentation and number formatting. No schema, RLS, auth authority, entitlement
authority, Stripe webhook or domain arithmetic was touched.

---

## 1. Defects fixed that were user-visible correctness problems

| # | Problem | Where it was | Fix |
|---|---|---|---|
| 1 | `movementPercent` rendered **100× too large** — RADAR showed `-1,190.5%` instead of `-11.9%` | `today`, `radar`, `matches/[id]` all passed a value already in percentage points through `Intl` `style: "percent"` | New `formatPercentagePoints()` in `@velyq/ui`, with a regression test |
| 2 | Raw 30-digit decimals shown as odds (`1.666666666666666666666666666667`) | `edge`, `radar`, `today` rendered `match.fairOdds` / `currentOdds` unformatted | New `formatOdds()`, fixed 2 dp everywhere |
| 3 | Probabilities rendered with a `+` sign (`+60.0%`), reading as a delta | `formatPercent` used `signDisplay: exceptZero` for everything | New `formatProbability()`; signed display retained only for edge and EV |
| 4 | `/pricing` sat inside `CustomerShell`, so **every logged-out visitor following the public "Pricing" link was redirected to sign-in** | `apps/web/app/pricing/page.tsx` | Pricing is now a public page in `PublicShell` |
| 5 | SCREAMING_SNAKE domain codes shown to customers (`WAIT_FOR_LINEUP`, `STALE_DATA`, `LOW_MAPPING_CONFIDENCE`, `today.view`, `past_due`) | ~12 call sites | `packages/ui/src/domain-labels.ts` maps every recommendation, lineup, freshness, quality-reason, subscription-status and entitlement code to localized prose |
| 6 | Language switcher was **decorative** — it wrote `localStorage`, which the server cannot read, so EL changed nothing but set `lang="el"` over English text (a WCAG 3.1.1 failure created by the feature) | `language-switcher.tsx`, `layout.tsx` | Locale now lives in the `velyq-locale` cookie, is resolved server-side, drives `<html lang>` and every string |
| 7 | Homepage "product visual" advertised fields that do not exist (`EDGE SCORE 78/100`, `Confidence: HIGH`) and used **real club names** on a contractually synthetic-only platform | `apps/web/app/page.tsx` | The hero preview now renders the actual synthetic fixture and real DTO fields |
| 8 | Three homepage feature CTAs pointed at `/sign-in`, sending unregistered visitors to a login wall | `apps/web/app/page.tsx` | All point to `/sign-up` |
| 9 | Server-rendered `role="alert"` errors were never announced (nothing is *inserted* after a redirect), and were not associated with their fields | all auth pages | Errors carry an `id`, `tabIndex={-1}`, and are referenced by `aria-describedby` + `aria-invalid` on the inputs |
| 10 | `reset-password` read `location.hash` during render → hydration mismatch, could submit an empty `access_token` | `reset-password/page.tsx` | Split into a server page + client `ResetForm` that reads the fragment in an effect; submit is disabled until it is read |
| 11 | `role="status" aria-live="polite"` on **every** status pill — 10+ live regions per page, nested inside links | `customer-shell.tsx` `Status` | Replaced by a plain `Badge`; live regions retained only where content actually changes |
| 12 | Unstyled classes rendering as browser defaults — `.admin-link` was `#0000EE` on near-black (**2.1:1**), `.fine-print` ran edge-to-edge with no padding | `customer-shell.tsx`, `pricing` | Both replaced by design-system components |
| 13 | The customer app was broken between 761px and ~1100px: a fixed 240px sidebar plus a non-wrapping `.edge-row` needing ~1000px | `globals.css` had a single 760px breakpoint | Rebuilt on a three-step scale with intrinsic `auto-fit` grids |

## 2. What was built

- **`packages/ui`** split into `locale.ts`, `format.ts`, `messages.ts`,
  `domain-labels.ts`. The Greek catalog is typed as a *complete*
  `Record<MessageKey, string>`, so a missing translation is a compile error.
  ~330 message keys, both languages, informal-singular Greek register per the
  brief (`Ξέχασες τον κωδικό σου;`). `odds → αποδόσεις`,
  `freshness → επικαιρότητα`, `NO_BET → Χωρίς σύσταση` (never
  «Όχι στοίχημα», which would read as a betting instruction).
- **Design system** in `globals.css`: one token layer (colour, type scale with
  a 12px floor, spacing, radii, elevation, motion), then primitives, then page
  compositions. The two conflicting palettes that previously overrode each
  other are gone.
- **Component layer** in `apps/web/app/components/`: `Badge`, `Card`, `Stat`,
  `Bar`, `Compare`, `Sparkline`, `Trend`, `DefinitionList`, `Explain`,
  `EmptyState`, `ErrorState`, `Skeleton`, plus shells and a hand-drawn inline
  icon set. All server components; the only client JS is the language switcher
  and the password reveal.
- **Homepage** rebuilt with all thirteen required sections.
- **Navigation**: persistent sidebar ≥70rem; below that a compact top bar plus
  a real bottom navigation bar, not a squeezed sidebar. `aria-current="page"`
  in both.
- **Visual analytics**: inline-SVG sparklines, model-vs-market comparison bars,
  EV bars and a quality meter. No charting dependency was added.

## 3. Verification

`node tooling/scripts/ux-sweep.mjs` (review tooling, not wired into CI) walks
**15 routes × 3 widths × 2 locales = 90 combinations** and checks horizontal
overflow, tap-target height, minimum font size, WCAG text contrast, landmarks,
`h1` count, labelled inputs and the resolved `lang`. Current result:

```
OK — 90 route/viewport/locale combinations clean.
```

`node tooling/scripts/ux-preview.mjs` starts the built app in synthetic-demo
mode on port 3100 for manual review (pair it with
`node tooling/e2e/customer-auth-stub.mjs` for the authenticated routes).

Format, lint and typecheck pass. Test results are in the final report.

## 4. Items Codex must review

1. **`apps/web/next.config.mjs` — added a webpack `extensionAlias`.** The only
   non-UI change in the branch. `@velyq/ui` is consumed as TypeScript source
   and the NodeNext baseline requires `.js` specifiers on relative imports,
   which webpack resolves literally. The alias maps `.js → .ts/.tsx/.js` for
   resolution only. `@velyq/ui` was also added to `transpilePackages`. If you
   prefer, the alternative is to build `@velyq/ui` to `dist` the way
   `@velyq/database` already does, and point its package export there.

2. **PRO and ELITE grant identical entitlements.** `packages/auth/src/index.ts`
   gives both `today.view, edge.full, radar.full, match.detail` — the arrays
   are byte-identical, so ELITE costs €30/month more for nothing. I did **not**
   change `packages/auth`. The ELITE card now states plainly that intelligence
   access currently matches PRO and that ELITE-only capabilities are in
   development. **This needs a product decision, not a copy fix.**

3. **`hasCustomerEntitlement` has no call sites.** Nothing in `apps/web`
   enforces plan entitlements — `loadCustomerToday` / `loadCustomerMatch` check
   the session only. A FREE user currently gets the full EDGE table, full RADAR
   and every Match Intelligence page. This is authorization behaviour and is
   deliberately out of my scope; the UI is ready for a paywall but does not
   impose one.

4. **The e2e specs are stale against this branch** — and were already stale
   against the base commit before my changes (they expect
   `"● SESSION ACTIVE"` where the base rendered `"● SECURE SESSION"`, and a
   5-item nav where the base had 4). They also assert English-only strings and
   the old `.auth-page` / `.auth-card` class names, so
   `tooling/e2e/customer-journey.spec.ts` and the visual-review snapshots need
   rewriting against the new markup. I did not rewrite them, because the
   snapshot baselines have to be regenerated on your CI runner rather than my
   machine.

5. **Locale cookie.** `velyq-locale` is written client-side and is therefore
   not `HttpOnly`. It is display state only — nothing in the authorization or
   entitlement path reads it. Worth a glance to confirm you agree.

6. **Legal copy is drafted, not reviewed.** The responsible-use page now
   carries "never stake money you cannot afford to lose" and a pointer to
   licensed support services in both languages. Greek gambling regulation has
   specific formulations (age limit, ΕΕΕΠ, helpline 1114) which I deliberately
   did **not** assert, since the launch jurisdiction is still undecided. All
   compliance-sensitive strings are marked `COMPLIANCE` in
   `packages/ui/src/messages.ts`.

7. **Fonts.** The stacks resolve to locally installed faces (Inter → Segoe UI
   Variable → system) with full Greek coverage; no webfont is downloaded, so
   there is no network dependency at build or runtime. Self-hosting Inter would
   be a straightforward upgrade if you want identical rendering across
   platforms.

## 5. Prohibited-claim check

No occurrence of guaranteed win, sure bet, guaranteed profit, 100% prediction,
risk-free betting, verified sharp money, money volume or bet handle. Every
mention of money flow in the product is an explicit denial that VELYQ observes
it, and those denials were strengthened rather than shortened in both
languages.
