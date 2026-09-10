# VELYQ — Data Source Registry

What VELYQ uses, what it could use, and what the terms actually say. Compiled
from official provider documentation and terms pages only: no signups, no API
calls, no scraping. Every claim below has a URL.

**Read the rights column before building on anything here.** Technical
completion does not imply commercial data rights, and two of the most useful
sources have terms that do not address commercial use at all.

Last researched 2026-09-10.

---

## 1. In use today

| Item | Value |
| --- | --- |
| Provider | API-Sports / API-Football (`api-sports.io`) |
| Capabilities used | fixtures, odds, quota status, results |
| Endpoints called | `/fixtures?date=`, `/odds?fixture=`, `/status`, `/fixtures?ids=` |
| Assumed daily limit | 100 (`ASSUMED_DAILY_LIMIT`, a documented assumption — only `/status` reports the real `limit_day`) |
| Purpose budgets | DISCOVERY 8, ODDS 60, LINEUP 15, RESULT 10, reserve 7 |
| Bookmakers returned | 10–13 per football fixture, observed |
| Markets wired | `MATCH_WINNER_1X2` (bet id 1), `TOTAL_GOALS` at line 2.5 (bet id 5) |

`/odds` is called without a `bet` parameter, so the provider returns every
market it quotes and VELYQ filters client-side. That is wasteful of payload
but not of quota — quota is per request, not per market.

**Unverified:** the documented ceiling on `/fixtures?ids=`. The result pass
batches up to twenty ids per request on the strength of the documentation, and
that ceiling has not been confirmed against an observed response. A
`RESULT_REJECTED` in `errors_by_reason` after the first live result pass would
mean the parameter, not the budget. See the production runbook.

---

## 2. Alternatives researched

Classification is about the free tier: **FREE** (no payment, usable),
**FREE-TIER-LIMITED** (a free tier exists but the capability VELYQ needs is
paid), **PAID-ONLY**.

### 2.1 Odds

| Source | Class | Historical odds | Bookmakers | Commercial use |
| --- | --- | --- | --- | --- |
| **The Odds API** | FREE-TIER-LIMITED | Paid only; archive from 2020-06-06, 5–10 min snapshots | ~130 listed across regions | **Explicitly permitted** |
| football-data.org (odds add-on) | PAID (€15/mo) | Not documented | Not documented — a single aggregated 1X2 price, no bookmaker identity | **Unaddressed** |
| SportMonks (odds add-on) | PAID (from €15/mo on top of €29+) | Retention not documented | Not published; in-play is bet365 only | Permitted for derived products; reselling forbidden |
| TheSportsDB | — | — | — | No odds endpoint exists |
| OpenLigaDB | — | — | — | No odds at all |

The Odds API's terms are the clearest of any source researched. Verbatim, from
<https://the-odds-api.com/terms-and-conditions.html>: storing data and
"retaining it indefinitely" is permitted, as is "Displaying our data in a UI,
website, or mobile app, including for commercial use". Prohibited: "Do not
resell, repackage, or redistribute our data as a standalone data product."
VELYQ's use — derived models and displayed analysis — is on the permitted
side; re-exporting a raw feed would not be.

Credit cost is `markets × regions`; free tier is 500 credits/month, which is
too small for a live pricing loop but ample for evaluation. Historical odds
cost 10 credits per region per market and are paid-tier only (their pricing
table and their docs contradict each other on this; the docs are the
conservative reading).

### 2.2 Fixtures, results, lineups

| Source | Class | Lineups | Results | Commercial use |
| --- | --- | --- | --- | --- |
| API-Sports | in use | yes | yes | current provider |
| football-data.org | FREE-TIER-LIMITED | from €29/mo; **timing before kickoff undocumented** | yes (delayed on free) | **Unaddressed** |
| TheSportsDB | FREE-TIER-LIMITED | yes, v2 is Premium | yes; livescores Premium | Permitted on a paid tier, attribution required |
| OpenLigaDB | **FREE** | none | yes, community-entered | **Explicitly permitted** (ODbL 1.0) |
| SportMonks | PAID | **official ~1h before kickoff**, predicted earlier with a `confirmed` flag | yes | permitted for derived products |

SportMonks is the only source that documents lineup timing, and ~1 hour before
kickoff matches what the `WAIT_FOR_LINEUP` gate assumes. Its free plan covers
only the Scottish Premiership and Danish Superliga.

football-data.org carries two clauses that matter more than its price. Clause
2.3 binds one API key to a single application and domain. Clause 9.1: "After
cancellation of the subscription to the Service, the Customer is not permitted
to reference the football data … obtained through the Football-Data API on
their own site or service" — which forbids retaining a historical training set
after cancelling. Its terms say nothing at all about commercial use, in either
direction.

### 2.3 Historical data for model training

| Source | Class | Depth | Closing odds | Commercial use |
| --- | --- | --- | --- | --- |
| **Football-Data.co.uk** | FREE | results from 1993/94; odds from 2000/01; 22 divisions + 16 extra leagues | **yes**, and O/U 2.5 and Asian handicap too | **UNCLEAR — no licence exists** |
| **openfootball / football.db** | FREE | England 2000-01→2026-27, internationals from 1872 | none | **Explicitly permitted (CC0)** |
| Wikidata | FREE | thin on individual matches | none | CC0 |
| DBpedia | FREE | season summaries, not matches | none | CC-BY-SA — **share-alike attaches** |
| StatsBomb open data | — | 24 competitions, event-grade | none | **Probably non-commercial — unverified** |
| Kaggle European Soccer DB | — | 2008–2016, stale | scraped from Football-Data.co.uk | **Do not use** — author demands non-commercial, contents are third-party |

Football-Data.co.uk is the single most useful free source for model work: it
carries both pre-closing and closing prices for 1X2, O/U 2.5 and Asian
handicap (the `C`-infix convention: `B365CH`, `MaxC>2.5`, `AHCh`), which is
exactly what a CLV methodology and an honest backtest need. It also has no
licence. The only usage statement anywhere on the site is on `data.php`: "All
data provided by Football-Data are made available for the purposes of league
match prediction only." Its own notes acknowledge the odds are compiled from
Betbrain, Oddsportal and individual bookmakers — so it likely could not grant
redistribution rights even if it chose to.

Reading: training internal models on it is within the stated scope.
Republishing the odds series as part of a product is legally unaddressed and
should not be done without written permission.

openfootball is the cleanest-rights results spine available — CC0, "Use as
please with no restrictions whatsoever" — and has no odds.

StatsBomb's binding terms are in a `LICENSE.pdf` that could not be extracted
(image/encoded PDF). Third-party documentation consistently describes it as
non-commercial. Treat as not permitted until someone reads that PDF.

---

## 3. Recommendation

| Capability | Best free option | Needs owner approval |
| --- | --- | --- |
| Fixtures | API-Sports (current) | — |
| Live odds | API-Sports (current) | The Odds API for a wider, better-documented panel |
| **Historical odds incl. closing** | Football-Data.co.uk, training only | The Odds API paid tier for a licensed series |
| Lineups | API-Sports (current) | SportMonks, the only documented timing |
| Results | API-Sports (current) | — |
| Historical results for training | openfootball (CC0) | — |

**The single highest-value paid option** is The Odds API at **$30/month**
(20,000 credits). It is the only researched source that combines a documented
multi-bookmaker panel, a real historical archive with 5–10 minute snapshot
granularity back to 2020, and terms that explicitly permit commercial display
and indefinite storage. What it unlocks that no free source does: a licensed
closing-price series, which is the input CLV and any honest backtest need and
which VELYQ currently cannot obtain with clear rights.

**Not purchased.** No subscription, upgrade or paid resource has been created.
This is a recommendation for the owner to accept or decline.

---

## 4. What provider-neutrality currently means here

The ingestion orchestrator (`packages/application/src/provider-ingestion.ts`)
already talks to ports, not to API-Sports: `discoverFixtures`, `fetchOdds`,
`fetchResults`, `probeQuotaStatus`, `persist*`, plus the quota and due-state
ports. API-Sports specifics live in one adapter
(`packages/database/src/repositories/provider-ingestion-adapter.ts`) and one
normalizer (`packages/providers/src/apisports.ts`).

The odds writer maps a **provider-neutral** market code (`MATCH_WINNER_1X2`,
`TOTAL_GOALS`) to the canonical market definition, so a second provider needs
a new adapter rather than changes to the writer.

**What is not yet done, stated plainly:**

- There is one quota state, keyed by provider id, but no orchestration across
  two providers. A second provider would need its own budget state and a
  capability-priority policy; the counters must never be mixed.
- There is no conflict policy. With one source there is nothing to disagree
  with. Two sources disagreeing on a kickoff time, a team identity, a lineup
  or a result must be resolved deterministically and must fail closed for
  decision-critical ambiguity — none of that exists yet.
- Provenance is recorded per observation (provider, provider record id,
  provider observed at, received at, normalization version, mapping version,
  sync run) and is inspectable in admin, but there is no source-confidence or
  review-state field, which a multi-source setup would need.

---

## 5. Rights status summary

| Source | Commercial rights |
| --- | --- |
| API-Sports | Current provider; terms not re-verified in this pass |
| The Odds API | **Permitted**, quoted above |
| OpenLigaDB | **Permitted**, ODbL 1.0, attribution + share-alike on redistributed databases |
| openfootball | **Permitted**, CC0 |
| TheSportsDB | Permitted on a paid tier, attribution required |
| SportMonks | Permitted for derived products; reselling forbidden |
| football-data.org | **Unaddressed** — get written confirmation |
| Football-Data.co.uk | **No licence exists** — training only, do not republish |
| StatsBomb | **Unverified**, probably non-commercial |
| Kaggle European Soccer DB | **Do not use** |

Commercial data-rights clearance for VELYQ is **not** complete. That is an
owner and legal decision, not an engineering one.
