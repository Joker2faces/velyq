# Production identity anomaly diagnosis — 2026-09-09

Read-only audit of Supabase project `zvdqkmevjfwprexshpap` at
`2026-09-09 04:05:01 UTC`. No production row was changed. Provider identity
and provider external IDs are the only repair authorities; names and slugs are
context only.

## LIVE events without provider identity

| Internal ID | Provider external ID | Competition | Country | Kickoff UTC | State | Catalog identity | Classification / reason |
|---|---|---|---|---|---|---|---|
| `b8007ef4-e5c0-465e-8bb9-ff6415ff8578` | — | MPBL | — | 2026-09-07 07:00 | FT | missing | STALE_LEGACY_RECORD — no source/odds/prediction link |
| `f072cc64-f063-4b2f-8734-5612225b0330` | — | MPBL | — | 2026-09-07 09:00 | FT | missing | STALE_LEGACY_RECORD — no source/odds/prediction link |
| `236537cc-b1cc-4c5e-8032-51f3230ecf23` | API_SPORTS `498280` | World Cup Women | — | 2026-09-07 09:30 | FT | missing | SAFE_DETERMINISTIC_REPAIR — one stable source pair, 24 odds |
| `a8b71da1-68c5-4923-8d38-bcb15eebfc46` | — | World Cup Women | — | 2026-09-07 09:30 | FT | missing | STALE_LEGACY_RECORD — no source/odds/prediction link |
| `286f2bd3-6f3a-4d5c-84ce-217166797854` | — | MPBL | — | 2026-09-07 11:00 | HT | missing | STALE_LEGACY_RECORD — no source/odds/prediction link |
| `a75f2b59-84a1-4462-8a9e-39bedb1bf77c` | API_SPORTS `498279` | World Cup Women | — | 2026-09-07 12:30 | NS | missing | SAFE_DETERMINISTIC_REPAIR — one stable source pair, 19 odds |
| `ab6ec031-403c-4847-8060-ca5ea447c708` | API_SPORTS `498276` | World Cup Women | — | 2026-09-07 12:30 | NS | missing | SAFE_DETERMINISTIC_REPAIR — one stable source pair, 22 odds |
| `f4d60066-e701-4975-8abf-5e9a1ff55622` | — | 1. Deild | — | 2026-09-07 15:00 | NS | missing | STALE_LEGACY_RECORD — no source/odds/prediction link |
| `a1eb98ea-c8b5-4877-85be-b622732e5d47` | API_SPORTS `498275` | World Cup Women | — | 2026-09-07 15:50 | NS | missing | SAFE_DETERMINISTIC_REPAIR — one stable source pair, 24 odds |
| `aea64075-0dfa-4df5-88b1-c051c35bccbf` | API_SPORTS `498278` | World Cup Women | — | 2026-09-07 15:50 | NS | missing | SAFE_DETERMINISTIC_REPAIR — one stable source pair, 22 odds |
| `a70176b1-6291-41d6-8f27-e4ff927418ff` | — | World Cup Women | — | 2026-09-07 18:45 | NS | missing | STALE_LEGACY_RECORD — no source/odds/prediction link |
| `ab0bbf82-95bb-4de1-8c8e-af437757fe3a` | API_SPORTS `498277` | World Cup Women | — | 2026-09-07 18:45 | NS | missing | SAFE_DETERMINISTIC_REPAIR — one stable source pair, 20 odds |
| `6f150415-16bd-41d5-8849-92258146e91d` | — | LNB | — | 2026-09-07 23:00 | NS | missing | STALE_LEGACY_RECORD — no source/odds/prediction link |
| `06cc4c45-8fbc-4299-89a8-f62a5445336d` | — | LNB | — | 2026-09-07 23:30 | NS | missing | STALE_LEGACY_RECORD — no source/odds/prediction link |
| `b6dd01fc-d635-4e34-8bfa-a92927aa1beb` | — | LNB | — | 2026-09-07 23:30 | NS | missing | STALE_LEGACY_RECORD — no source/odds/prediction link |

The six repair candidates each have exactly one distinct stable
`(provider_id, provider_external_id)` through an ODDS source observation and
no conflicting identity. The other nine remain unresolved; inferring their
provider would be destructive.

## CONFIRMED competition identities without catalog competition

`CONFIRMED` is invalid under the resolver semantics because resolution needs a
non-null internal competition. The deterministic repair is demotion to
`PENDING_REVIEW`, not fabricated catalog materialization.

| Internal ID | Provider external ID | Canonical code | Competition / country | Catalog | Classification |
|---|---|---|---|---|---|
| `5940558f-1f9e-4e36-b7c1-d922d0778b93` | API_SPORTS `197` | `GRC_SUPER_LEAGUE` | Super League 1 / GR | missing | SAFE_DETERMINISTIC_REPAIR |
| `36e337cd-4889-409c-a349-bc3271851bfb` | API_SPORTS `203` | `TUR_SUPER_LIG` | Süper Lig / TR | missing | SAFE_DETERMINISTIC_REPAIR |
| `99ee39ae-5016-4673-b327-7d0e66fb616a` | API_SPORTS `3` | `UEFA_EUROPA_LEAGUE` | UEFA Europa League / — | missing | SAFE_DETERMINISTIC_REPAIR |
| `6c665697-a4bf-42a4-b093-d6a46b4a62df` | API_SPORTS `61` | `FRA_LIGUE_1` | Ligue 1 / FR | missing | SAFE_DETERMINISTIC_REPAIR |
| `60deff8d-0aeb-42fd-86da-62058fde96a7` | API_SPORTS `78` | `DEU_BUNDESLIGA` | Bundesliga / DE | missing | SAFE_DETERMINISTIC_REPAIR |
| `c5e68051-0e71-4bbe-afd3-97370271621b` | API_SPORTS `848` | `UEFA_CONFERENCE_LEAGUE` | UEFA Conference League / — | missing | SAFE_DETERMINISTIC_REPAIR |
| `75330d39-82cc-4005-b16a-1347cafb2f7c` | FOOTBALL_DATA_UK `D1` | `DEU_BUNDESLIGA` | D1 / DE | missing | SAFE_DETERMINISTIC_REPAIR |
| `b13686de-72fe-4870-b6c5-74c701d4b838` | FOOTBALL_DATA_UK `E1` | `ENG_CHAMPIONSHIP` | E1 / GB | missing | SAFE_DETERMINISTIC_REPAIR |
| `4ba8785f-1cd0-4481-9f71-c9a066cb71fe` | FOOTBALL_DATA_UK `F1` | `FRA_LIGUE_1` | F1 / FR | missing | SAFE_DETERMINISTIC_REPAIR |
| `3381f2d6-3094-4b6d-8d45-6187f75894d1` | FOOTBALL_DATA_UK `G1` | `GRC_SUPER_LEAGUE` | G1 / GR | missing | SAFE_DETERMINISTIC_REPAIR |
| `20e03dba-95b0-4e86-a400-d74dbe2f23f2` | FOOTBALL_DATA_UK `N1` | `NLD_EREDIVISIE` | N1 / NL | missing | SAFE_DETERMINISTIC_REPAIR |
| `36b2bae5-eff1-4a09-9e48-2c998f9f513e` | FOOTBALL_DATA_UK `T1` | `TUR_SUPER_LIG` | T1 / TR | missing | SAFE_DETERMINISTIC_REPAIR |

## Root cause and closure

The 15 events were inserted by a legacy generic ingestion path before the
current transactional fixture repository. Production has no provenance
trigger. The compatibility migration skipped installing its trigger when it
found legacy orphans, leaving the unsafe state recreatable.

`20260926120000_enforce_identity_invariants.sql` preserves legacy rows but
requires every future LIVE insert/update to acquire provider identity before
commit. It also adds a future-write constraint rejecting
`CONFIRMED AND competition_id IS NULL`; existing violations remain available
under `NOT VALID` until reviewed remediation.

`pnpm identity:remediate` is transactional, locked, count-guarded, rerunnable,
dry-run by default, and contains no deletes. It inserts only unambiguous event
identities and demotes false confirmations without making a catalog guess.

Production preflight:

- deterministic repairable: 18 (6 inserts + 12 updates)
- stale legacy unresolved: 9
- ambiguous: 0
- expected inserts: 6
- expected updates: 12
- expected deletes: 0

Production execution requires explicit owner authorization.
