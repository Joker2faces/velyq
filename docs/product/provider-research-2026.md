# Provider capability notes — September 2026

| Provider | Viable role | Constraint | Decision |
| --- | --- | --- | --- |
| API-Football | Primary fixture, lineup, odds and provider-prediction evidence | Coverage differs by league/fixture; live odds are ephemeral | Retain normalized, timestamped observations; do not display a provider prediction as VELYQ’s model. |
| football-data.org | Secondary fixtures/results/standings/lineups | Tiered competition coverage, rate limits, visible attribution requirement | Candidate resilience source for results; add only with attribution and a separate adapter. |
| Weather | Context feature | Licensing, historical availability and venue mapping unverified | Deferred; no provider selected. |

API-Football advertises fixtures, lineups, statistics, predictions and pre-match/live odds on its [official site](https://www.api-football.com/), while its [coverage table](https://www.api-football.com/coverage/) explicitly makes feature coverage competition-specific. Its [odds guidance](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide) says live odds disappear after final whistle, so persistence is a product requirement, not an optimization.

[football-data.org’s current pricing](https://www.football-data.org/pricing) provides fixtures, live scores, standings, lineups and an odds add-on across tiered coverage. Its [FAQ](https://www.football-data.org/documentation/faq) requires visible attribution, which would be a launch requirement if adopted.
