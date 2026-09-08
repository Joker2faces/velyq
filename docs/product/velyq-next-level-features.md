# VELYQ next-level product features

## Implemented in this branch — database migration pending verification

- Separate immutable `forecasts` and price-aware `decisions` records.
- Provider-observed `event_results` and per-decision `market_settlements` for 1X2 and Over/Under 2.5.
- Closing-line value calculation and market consensus/stability primitives.
- Deterministic tests for win/loss/unsettled handling, CLV, and price dispersion.

Status: **IMPLEMENTED_NOT_DB_VERIFIED**. The migration has not been applied to Supabase; production is untouched.

## P0 customer surfaces

- **Today:** show `Watch` when the forecast is credible but current price fails decision criteria; explain the missing condition and target price.
- **Match Intelligence:** chronological event/forecast/decision/price/result timeline, with an immutable snapshot link per decision.
- **Results:** filter by sport, market and model version; display sample size, settled W/L/void, CLV distribution and confidence caveats.
- **Radar:** add coverage and stability badges rather than ranking thin or fragmented books as high conviction.

## P1 after real result coverage is measured

- Model-health dashboard by competition/market/version (calibration, Brier/log loss, settlement and CLV separated).
- Multi-book opening/current/closing consensus with movement provenance.
- Weather only after a provider’s commercial/licensing terms, historical coverage and venue mapping are reviewed; it is intentionally not wired today.

## Deliberately deferred

- User staking, bankroll advice, auto-betting and any claims of profitability.
- Player props, Asian lines and in-play settlement beyond the tested phase-one rules.
- A public performance claim before enough real, settled decisions exist.
