# Historical data provenance

What the training corpus is, where it came from, and what may be done with it.
Written by hand and reviewed, unlike `football-model-backtest.md` which is
generated — this file records decisions, not measurements.

## The source

| | |
| --- | --- |
| **Code** | `FOOTBALL_DATA_UK` |
| **Publisher** | Football-Data.co.uk |
| **Site** | <https://football-data.co.uk/> |
| **Schema documentation** | <https://football-data.co.uk/notes.txt> |
| **Import version** | `football-data.v1` |
| **Terms review** | **NEEDS_OWNER_REVIEW** |

Two endpoints are used, for two different purposes:

- `mmz4281/<season>/<division>.csv` — the season archive: results plus
  pre-closing and closing bookmaker prices. **Training data.**
- `fixtures.csv` — the next few days of *unplayed* fixtures with pre-event
  prices already attached. **Live decision input.** The season archives
  contain played matches only, so nothing in them can be predicted; this file
  is what makes a real pre-event prediction possible from this publisher at
  all, with no API key and no request quota.

`notes.txt` is downloaded alongside the data on every import, so the schema
interpretation this importer relies on is recorded at import time rather than
recalled later.

## Terms, and what is and is not in scope

`notes.txt` documents the column schema and credits the publisher's own
upstream sources — XScores for results, and Betbrain, Oddsportal and
individual bookmakers for prices. It states **no licence** and grants **no
explicit redistribution permission**.

Internal model training and public redistribution are separate questions, and
this repository answers only the first:

- **In scope, and done.** Using the data internally to fit model parameters.
  What ships is the fitted artifact — team attack and defence ratings,
  competition baselines, a dependence parameter, calibrators and measured
  uncertainty profiles. None of it reproduces the source rows.
- **Not in scope, and blocked.** Serving the publisher's data to customers or
  publishing the dataset through VELYQ. The provider policy registered in
  `20260908093000_provision_real_intelligence_policy.sql` grants
  `RETAIN_NORMALIZED` and deliberately grants **no `DISPLAY` action**, so the
  policy layer refuses a customer-facing use rather than relying on anyone
  remembering this document. Attribution is required either way.
- **Needs the owner.** Whether to seek permission, licence the data, or move
  to a source with explicit terms before any redistribution. Until then
  `termsReview` stays `NEEDS_OWNER_REVIEW`.

The files themselves are **never committed**. `data/historical/` is
gitignored; only provenance, per-file checksums and derived parameters are
versioned. Re-download with `pnpm data:historical:download`.

## What is imported

Eleven competitions, twelve seasons each (2015/16 to 2026/27):

| Division | Canonical competition | Country |
| --- | --- | --- |
| E0 | ENG_PREMIER_LEAGUE | GB |
| E1 | ENG_CHAMPIONSHIP | GB |
| SP1 | ESP_LA_LIGA | ES |
| I1 | ITA_SERIE_A | IT |
| D1 | DEU_BUNDESLIGA | DE |
| F1 | FRA_LIGUE_1 | FR |
| N1 | NLD_EREDIVISIE | NL |
| P1 | PRT_PRIMEIRA_LIGA | PT |
| B1 | BEL_PRO_LEAGUE | BE |
| T1 | TUR_SUPER_LIG | TR |
| G1 | GRC_SUPER_LEAGUE | GR |

Everything else the publisher ships — the lower English tiers, the Scottish
leagues, the second divisions of the mapped countries — is deliberately
unmapped. An unmapped division is not an error: it has no policy, so it fails
closed. Adding one means adding a `FOOTBALL_DATA_DIVISIONS` entry *and* a
policy entry, which is a reviewed change rather than a config tweak.

## Schema interpretation

Read from `notes.txt`, and the parts that matter:

- `Div`, `Date` (`dd/mm/yy` or `dd/mm/yyyy`), `Time`, `HomeTeam`, `AwayTeam`,
  `FTHG`/`FTAG` (full-time goals), `FTR` (result), `HTHG`/`HTAG` (half time).
- **Pre-closing prices** are the plain columns: `AvgH`/`AvgD`/`AvgA` for the
  panel average, `MaxH`/`MaxD`/`MaxA` for the panel maximum, and per-bookmaker
  columns like `B365H`. `notes.txt` states these are collected "Friday
  afternoons" for weekend games and "Tuesday afternoons" for midweek games —
  genuinely before kickoff, so they are legitimate decision inputs.
- **Closing prices** are the same with a `C` inserted after the abbreviation:
  `AvgCH`, `B365CH`, `AvgC>2.5`. These are the last thing the market knew.
  They are stored, and they are **evaluation data only** — using a closing
  price to make a historical decision is looking at the answer. The database
  enforces the distinction with a `price_phase` column and the backtest never
  reads `CLOSING` as an input.
- **Over/under** covers the 2.5 line only: `Avg>2.5`, `Avg<2.5`, and a couple
  of individual books.
- **Both teams to score has no column at all.** The *outcome* is derivable
  from the final score, so the model is trained and scored on it, but there is
  no historical price — so its market baseline is legitimately absent and
  reported as `n/a` rather than approximated from the 1X2 book.

### Two eras of the same format

The format is not stable across the corpus, and treating it as stable silently
loses four seasons of prices:

| Seasons | Panel aggregates | Closing prices | Kickoff time |
| --- | --- | --- | --- |
| 2015/16 – 2018/19 | Betbrain (`BbAvH`, `BbMx>2.5`) | absent | absent |
| 2019/20 – 2026/27 | Market (`AvgH`, `Max>2.5`) | present | present |

The parser reads by column *name*, tolerates absent columns, and records which
family each file used, so the backtest can be honest about which seasons could
have had a closing-line comparison at all.

### Encoding

The files are **Windows-1252**, not UTF-8, and current-season files start with
a UTF-8 byte-order mark. Both matter more than they look: team identity in the
model is a normalized team *name*, so decoding `Nîmes` as UTF-8 produces a
replacement character and quietly splits one club into two half-strength sets
of ratings, while a BOM left in place becomes part of the first column's name
and makes every division lookup miss.

## Team and competition identity

Matching is **exact on a normalized key, plus an explicit scoped alias list**,
and anything else is quarantined. Fuzzy string similarity is specifically
rejected: "Manchester United" and "Manchester City" are two edits apart, and a
wrong merge does not raise an error — it trains one club's attack rating on
another club's results and then prices a market with it.

Normalization removes case, punctuation and accents, and nothing else. It
deliberately does *not* strip club-type words: dropping "Sporting" collapses
Sporting Lisbon into Sporting Gijón, and normalizing "Athletic"/"Atlético"
collapses Athletic Bilbao into Atlético Madrid.

The alias table exists for the *other* provider. The training corpus and the
fixtures feed come from the same publisher and therefore already agree with
each other, so no name mapping stands between a live fixture and its ratings.
API-Sports names are a separate problem and the table grows one verified entry
at a time; an unlisted disagreement is quarantined, never guessed.

## Secondary sources

- **API-Sports** remains the operational provider and is registered
  separately. It is not used for bulk historical backfill: the free tier
  allows 100 requests a day, and spending it on history would starve the
  live-odds path it exists for.
- **football-data.org** and other open results sources are permitted as
  validators only, and only with explicit provenance recorded per row. None is
  in use today.

Source identity is never blended. `research.imports` records the source, the
import version, the file URI and its sha256; `research.matches` links to that
import. A claim about "our data" is traceable to a specific file.

## Where it lives

The corpus is in its own `research` schema, deliberately apart from
`catalog.events` and `market.*`. Those tables are the operational record of
events VELYQ tracks live, with provider run lineage and append-only
observation history attached. Training rows are a different thing with a
different publisher, lifecycle and provenance model, and mixing them would
make "how many events do we cover" unanswerable and every operational query
silently filter-dependent.

`research.matches` and `research.match_odds` are append-only: a corpus row
that can be deleted after a model cited it makes that model unexplainable.
A corrected re-release of a file is a **new import**, identified by content
hash, rather than an overwrite of the rows a registered artifact was trained
on.
