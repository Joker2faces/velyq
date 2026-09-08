# VELYQ competitive research — September 2026

## What the market already makes easy

Odds-comparison and value-betting products make fast scanning, bookmaker comparison and alerting familiar. That is useful but insufficient differentiation: a user still needs to know whether a price is trustworthy, why an opportunity is withheld, and whether the model's decision held up. VELYQ should therefore lead with evidence, not with a generic “best bet” feed.

## Defensible wedge

1. **Forecast ≠ decision.** Preserve the probability estimate independently from the price-aware decision, so a user can replay a decision when the line or the model changes.
2. **Explain abstention.** “Why not” codes, coverage state and a target “price I want” turn a no-bet into useful monitoring instead of an empty screen.
3. **Decision history and closing-line value.** Publish only settled, provenance-backed records; never manufacture a historic track record.
4. **Market context.** Show number of books, consensus dispersion and stability before treating a listed price as a tradable market.

## Product principles

- Never call provider predictions VELYQ forecasts; provider output is evidence with its own provenance.
- No recommendation is an action instruction. UI language remains informational and includes quality/freshness.
- Results and settlement are immutable records. Corrections append a later provider result; they do not rewrite the prior decision.
- A customer page must degrade to unavailable/insufficient coverage rather than fall back to synthetic data in a live-labelled view.

## Sources

- [API-Football coverage](https://www.api-football.com/coverage/) documents that coverage varies by competition and feature; the product must gate per fixture/league rather than promise blanket availability.
- [API-Football guide](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide) notes its predictions are a separate provider model and that live odds are not retained after a match, supporting VELYQ’s own timestamped persistence.
- [football-data.org pricing](https://www.football-data.org/pricing) illustrates a practical secondary provider for fixtures/results/lineups, but its odds scope and call limits mean it is not a substitute for a multi-book odds history.
