# Real Football/Odds Data — Provider Readiness

**Status: no live web research was performed in this pass** (no browsing tool
was available/authorized for this). What follows is drawn from general
knowledge of this market as of early 2026 and is **NOT** a substitute for
the owner or a data engineer confirming current pricing, coverage and terms
directly with each vendor before any commercial decision. Terms, tiers and
prices in this space change frequently.

## Candidates (verify before acting on any of this)

| Provider | Category | Notes to verify |
|---|---|---|
| **Sportradar** | Best commercial | Broad odds + fixtures + lineups coverage, official league partnerships; commercial redistribution rights are typically explicit but priced for scale — confirm current contract minimums. |
| **Genius Sports** | Best commercial (alt.) | Similar tier to Sportradar; strong in specific leagues/markets — confirm current European football + odds coverage. |
| **Betfair / odds aggregators (OddsJam, The Odds API)** | Best value | Multi-bookmaker odds APIs at a fraction of the "official data" price; confirm whether pre-match + in-play + historical odds are all included at the tier you need, and confirm commercial redistribution is actually permitted (many free/cheap tiers restrict display-only, non-redistribution use). |
| **API-Football (api-sports.io)** | Best free/development tier | Free tier exists for development; fixtures, lineups, some odds. Confirm current odds-market coverage (historically thinner than dedicated odds APIs) and confirm commercial-use terms before relying on it past a demo. |
| **Football-Data.org** | Best free/development (fixtures-only) | Free tier for fixtures/results/competitions; does **not** provide odds — would need pairing with an odds-only API. |

## What VELYQ needs, concretely

- Fixtures: competition, season, teams, kickoff time, status
- Pre-match odds: multiple bookmakers, 1X2 at minimum (O/U, BTTS, AH later)
- Odds history: opening price + a chronological observation stream (not just
  latest) — this is the input RADAR needs and many cheap APIs don't expose it
- Lineups: official/expected, ideally with a "published at" timestamp
- Results (for any future backtesting)

## Architecture readiness

The domain code is **not** provider-neutral yet. `customer-data.ts` and the
associated DTOs are synthetic fixtures, not a provider adapter. Building
`FootballProvider` / `OddsProvider` / `LineupProvider` interfaces with a
stable internal-ID mapping (provider → providerEntityId → internalEntityId)
is real, scoped engineering work that should happen once a provider is
actually chosen — building it against no real API risks guessing the wrong
shape. This is flagged as the correct next engineering step once procurement
completes, not attempted speculatively in this pass.

## Commercial rights

**NOT CLEARED.** No provider has been contracted. Every candidate above must
be confirmed for: commercial-use permission, display vs. redistribution
rights, caching/storage retention limits, and attribution requirements,
before any real data reaches a paying customer.

## Recommendation

1. Owner/product selects a provider tier based on actual budget and target
   leagues (this is a commercial decision, not an engineering one).
2. Confirm commercial terms in writing.
3. Only then: build the provider-neutral ingestion layer against the real
   API contract.
