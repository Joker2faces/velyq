/**
 * Team identity across sources.
 *
 * Historical team names will not match a live provider's names, and the
 * tempting fix — fuzzy string similarity — is the one thing that must not
 * happen here. "Manchester United" and "Manchester City" are two edits apart;
 * so are "Racing Santander" and "Rayo Santander". A wrong merge does not throw
 * an error, it silently trains one team's attack rating on another team's
 * results and then prices a market with it.
 *
 * So matching is exact on a normalized key, plus an explicit alias list, and
 * anything else is quarantined for a human to look at.
 */

export type TeamMappingStatus = "RESOLVED" | "QUARANTINED";

/**
 * Case, punctuation and accents removed; nothing else.
 *
 * Deliberately does *not* strip club-type words (FC, CF, AC, SC, Real,
 * Sporting). Dropping them looks harmless and is not: Sporting Lisbon and
 * Sporting Gijón collapse together, as do Athletic Bilbao and Atlético Madrid
 * once "Athletic"/"Atletico" normalize the same way.
 */
export function normalizeTeamKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Names that mean the same club in different sources.
 *
 * Every entry is scoped to a canonical competition, because an unscoped alias
 * table is how a Spanish club's short name starts resolving a Portuguese one.
 * The list holds the cases where two sources genuinely disagree, not every
 * team: identical names need no entry.
 *
 * This is deliberately small and hand-checked. The corpus and the fixtures
 * feed used for prediction come from the same publisher and therefore already
 * agree with each other, so this table exists for the *other* provider —
 * API-Sports — and it grows one verified entry at a time. An unlisted
 * disagreement is quarantined, never guessed.
 */
export const TEAM_ALIASES: readonly Readonly<{
  canonicalCompetitionCode: string;
  /** The name as some other source spells it. */
  alias: string;
  /** The name the training corpus uses, which owns team identity. */
  corpusName: string;
}>[] = Object.freeze([
  // England — Football-Data abbreviates heavily where API-Sports does not.
  {
    canonicalCompetitionCode: "ENG_PREMIER_LEAGUE",
    alias: "Manchester United",
    corpusName: "Man United",
  },
  {
    canonicalCompetitionCode: "ENG_PREMIER_LEAGUE",
    alias: "Manchester City",
    corpusName: "Man City",
  },
  {
    canonicalCompetitionCode: "ENG_PREMIER_LEAGUE",
    alias: "Newcastle United",
    corpusName: "Newcastle",
  },
  {
    canonicalCompetitionCode: "ENG_PREMIER_LEAGUE",
    alias: "Nottingham Forest",
    corpusName: "Nott'm Forest",
  },
  {
    canonicalCompetitionCode: "ENG_PREMIER_LEAGUE",
    alias: "Wolverhampton Wanderers",
    corpusName: "Wolves",
  },
  {
    canonicalCompetitionCode: "ENG_PREMIER_LEAGUE",
    alias: "Tottenham Hotspur",
    corpusName: "Tottenham",
  },
  {
    canonicalCompetitionCode: "ENG_PREMIER_LEAGUE",
    alias: "West Ham United",
    corpusName: "West Ham",
  },
  {
    canonicalCompetitionCode: "ENG_PREMIER_LEAGUE",
    alias: "Brighton & Hove Albion",
    corpusName: "Brighton",
  },
  {
    canonicalCompetitionCode: "ENG_PREMIER_LEAGUE",
    alias: "Leeds United",
    corpusName: "Leeds",
  },
  {
    canonicalCompetitionCode: "ENG_CHAMPIONSHIP",
    alias: "Sheffield United",
    corpusName: "Sheffield United",
  },
  // Netherlands — the corpus drops the club's initials, the provider keeps
  // them. Verified against the trained artifact, whose Eredivisie parameters
  // carry "nijmegen" and no "nec-nijmegen".
  {
    canonicalCompetitionCode: "NLD_EREDIVISIE",
    alias: "NEC Nijmegen",
    corpusName: "Nijmegen",
  },
  // Spain
  {
    canonicalCompetitionCode: "ESP_LA_LIGA",
    alias: "Atletico Madrid",
    corpusName: "Ath Madrid",
  },
  {
    canonicalCompetitionCode: "ESP_LA_LIGA",
    alias: "Athletic Club",
    corpusName: "Ath Bilbao",
  },
  {
    canonicalCompetitionCode: "ESP_LA_LIGA",
    alias: "Real Sociedad",
    corpusName: "Sociedad",
  },
  {
    canonicalCompetitionCode: "ESP_LA_LIGA",
    alias: "Real Betis",
    corpusName: "Betis",
  },
  {
    canonicalCompetitionCode: "ESP_LA_LIGA",
    alias: "Celta Vigo",
    corpusName: "Celta",
  },
  {
    canonicalCompetitionCode: "ESP_LA_LIGA",
    alias: "Rayo Vallecano",
    corpusName: "Vallecano",
  },
  {
    canonicalCompetitionCode: "ESP_LA_LIGA",
    alias: "Deportivo Alaves",
    corpusName: "Alaves",
  },
  // Italy
  {
    canonicalCompetitionCode: "ITA_SERIE_A",
    alias: "AC Milan",
    corpusName: "Milan",
  },
  {
    canonicalCompetitionCode: "ITA_SERIE_A",
    alias: "Inter",
    corpusName: "Inter",
  },
  {
    canonicalCompetitionCode: "ITA_SERIE_A",
    alias: "Hellas Verona",
    corpusName: "Verona",
  },
  // Germany
  {
    canonicalCompetitionCode: "DEU_BUNDESLIGA",
    alias: "Bayern Munich",
    corpusName: "Bayern Munich",
  },
  {
    canonicalCompetitionCode: "DEU_BUNDESLIGA",
    alias: "Borussia Dortmund",
    corpusName: "Dortmund",
  },
  {
    canonicalCompetitionCode: "DEU_BUNDESLIGA",
    alias: "Borussia Monchengladbach",
    corpusName: "M'gladbach",
  },
  {
    canonicalCompetitionCode: "DEU_BUNDESLIGA",
    alias: "Bayer Leverkusen",
    corpusName: "Leverkusen",
  },
  {
    canonicalCompetitionCode: "DEU_BUNDESLIGA",
    alias: "VfB Stuttgart",
    corpusName: "Stuttgart",
  },
  {
    canonicalCompetitionCode: "DEU_BUNDESLIGA",
    alias: "Eintracht Frankfurt",
    corpusName: "Ein Frankfurt",
  },
  {
    canonicalCompetitionCode: "DEU_BUNDESLIGA",
    alias: "FSV Mainz 05",
    corpusName: "Mainz",
  },
  // France
  {
    canonicalCompetitionCode: "FRA_LIGUE_1",
    alias: "Paris Saint Germain",
    corpusName: "Paris SG",
  },
  {
    canonicalCompetitionCode: "FRA_LIGUE_1",
    alias: "Olympique Marseille",
    corpusName: "Marseille",
  },
  {
    canonicalCompetitionCode: "FRA_LIGUE_1",
    alias: "Olympique Lyonnais",
    corpusName: "Lyon",
  },
  {
    canonicalCompetitionCode: "FRA_LIGUE_1",
    alias: "Stade Rennais",
    corpusName: "Rennes",
  },
  {
    canonicalCompetitionCode: "FRA_LIGUE_1",
    alias: "Saint Etienne",
    corpusName: "St Etienne",
  },
  // Netherlands, Portugal, Belgium, Turkey, Greece
  {
    canonicalCompetitionCode: "NLD_EREDIVISIE",
    alias: "PSV Eindhoven",
    corpusName: "PSV Eindhoven",
  },
  {
    canonicalCompetitionCode: "NLD_EREDIVISIE",
    alias: "Sparta Rotterdam",
    corpusName: "Sparta Rotterdam",
  },
  {
    canonicalCompetitionCode: "PRT_PRIMEIRA_LIGA",
    alias: "Sporting CP",
    corpusName: "Sp Lisbon",
  },
  {
    canonicalCompetitionCode: "PRT_PRIMEIRA_LIGA",
    alias: "FC Porto",
    corpusName: "Porto",
  },
  {
    canonicalCompetitionCode: "PRT_PRIMEIRA_LIGA",
    alias: "SL Benfica",
    corpusName: "Benfica",
  },
  {
    canonicalCompetitionCode: "PRT_PRIMEIRA_LIGA",
    alias: "Vitoria Guimaraes",
    corpusName: "Guimaraes",
  },
  {
    canonicalCompetitionCode: "BEL_PRO_LEAGUE",
    alias: "Club Brugge KV",
    corpusName: "Club Brugge",
  },
  {
    canonicalCompetitionCode: "BEL_PRO_LEAGUE",
    alias: "Royale Union Saint Gilloise",
    corpusName: "St. Gilloise",
  },
  {
    canonicalCompetitionCode: "BEL_PRO_LEAGUE",
    alias: "RSC Anderlecht",
    corpusName: "Anderlecht",
  },
  {
    canonicalCompetitionCode: "TUR_SUPER_LIG",
    alias: "Fenerbahce",
    corpusName: "Fenerbahce",
  },
  {
    canonicalCompetitionCode: "TUR_SUPER_LIG",
    alias: "Basaksehir",
    corpusName: "Buyuksehyr",
  },
  {
    canonicalCompetitionCode: "GRC_SUPER_LEAGUE",
    alias: "Olympiakos Piraeus",
    corpusName: "Olympiakos",
  },
  {
    canonicalCompetitionCode: "GRC_SUPER_LEAGUE",
    alias: "PAOK Salonika",
    corpusName: "PAOK",
  },
  {
    canonicalCompetitionCode: "GRC_SUPER_LEAGUE",
    alias: "AEK Athens FC",
    corpusName: "AEK",
  },
]);

function aliasKey(canonicalCompetitionCode: string, name: string) {
  return `${canonicalCompetitionCode}|${normalizeTeamKey(name)}`;
}

const ALIAS_INDEX: ReadonlyMap<string, string> = new Map(
  TEAM_ALIASES.map((entry) => [
    aliasKey(entry.canonicalCompetitionCode, entry.alias),
    normalizeTeamKey(entry.corpusName),
  ]),
);

export type TeamResolution =
  | Readonly<{ status: "RESOLVED"; teamKey: string; via: "EXACT" | "ALIAS" }>
  | Readonly<{
      status: "QUARANTINED";
      reason: "UNKNOWN_TEAM" | "AMBIGUOUS_TEAM";
      candidates: readonly string[];
    }>;

/**
 * Maps an external team name onto the identity the trained model uses.
 *
 * `knownTeamKeys` is the set of teams that competition's model parameters
 * actually cover, so a name that normalizes cleanly but belongs to a team the
 * model has never seen is quarantined rather than resolved to nothing. That is
 * the newly-promoted-club case, and it has to fail closed: there is no attack
 * rating to price with.
 */
export function resolveTeam(
  input: Readonly<{
    canonicalCompetitionCode: string;
    sourceName: string;
    knownTeamKeys: ReadonlySet<string>;
  }>,
): TeamResolution {
  const direct = normalizeTeamKey(input.sourceName);
  if (input.knownTeamKeys.has(direct))
    return { status: "RESOLVED", teamKey: direct, via: "EXACT" };

  const aliased = ALIAS_INDEX.get(
    aliasKey(input.canonicalCompetitionCode, input.sourceName),
  );
  if (aliased !== undefined && input.knownTeamKeys.has(aliased))
    return { status: "RESOLVED", teamKey: aliased, via: "ALIAS" };

  return {
    status: "QUARANTINED",
    reason: "UNKNOWN_TEAM",
    candidates: aliased === undefined ? [direct] : [direct, aliased],
  };
}
