/**
 * The versioned competition eligibility policy.
 *
 * "Discovered" and "worth showing a customer" are different questions, and
 * conflating them is why Today filled up with competitions the model has never
 * seen. A provider returns every fixture it knows about — youth teams, reserve
 * sides, regional cups, friendlies — and all of it is legitimately in the
 * database and legitimately visible to an administrator. None of it is
 * automatically eligible for customer intelligence.
 *
 * Eligibility here is decided by evidence, never by how famous the teams are:
 * does a trained model cover this competition, is there enough historical
 * sample behind it, and does it get priced by enough bookmakers.
 */

export type CompetitionState =
  "PRIME" | "SUPPORTED" | "EXPERIMENTAL" | "ADMIN_ONLY" | "EXCLUDED";

export type CompetitionPolicyEntry = Readonly<{
  /** Stable across providers and never derived from a display name. */
  canonicalCode: string;
  sportCode: "FOOTBALL" | "BASKETBALL";
  displayName: string;
  /** ISO 3166-1 alpha-2, matching `catalog.competitions.country_code`. */
  countryCode: string;
  /** 1 = national top flight. */
  tier: number;
  state: CompetitionState;
  modelEligible: boolean;
  customerVisible: boolean;
  minHistoricalSample: number;
  minBookmakerCoverage: number;
  reasonCodes: readonly string[];
}>;

export const COMPETITION_POLICY_VERSION = "competition-policy.v1" as const;

/**
 * The minimum evidence a competition needs before its markets can reach a
 * customer.
 *
 * `minHistoricalSample` is per competition, not per corpus: a Dixon-Coles
 * attack/defence pair is estimated per team, so a league needs enough matches
 * for every team in it to be identified, not just enough matches overall.
 * 1,500 is roughly four seasons of a 20-team league.
 *
 * `minBookmakerCoverage` is 3 because a de-vigged consensus and a dispersion
 * measure both need more than a pair of prices to mean anything.
 */
export const DEFAULT_MIN_HISTORICAL_SAMPLE = 1500;
export const DEFAULT_MIN_BOOKMAKER_COVERAGE = 3;

function prime(
  canonicalCode: string,
  displayName: string,
  countryCode: string,
  tier: number,
): CompetitionPolicyEntry {
  return {
    canonicalCode,
    sportCode: "FOOTBALL",
    displayName,
    countryCode,
    tier,
    state: "PRIME",
    modelEligible: true,
    customerVisible: true,
    minHistoricalSample: DEFAULT_MIN_HISTORICAL_SAMPLE,
    minBookmakerCoverage: DEFAULT_MIN_BOOKMAKER_COVERAGE,
    reasonCodes: ["HISTORICAL_CORPUS_AVAILABLE", "BOOKMAKER_COVERAGE_DEEP"],
  };
}

function supported(
  canonicalCode: string,
  displayName: string,
  countryCode: string,
  tier: number,
): CompetitionPolicyEntry {
  return {
    ...prime(canonicalCode, displayName, countryCode, tier),
    state: "SUPPORTED",
  };
}

/**
 * Competitions the model can score but that are not offered as customer
 * intelligence yet.
 *
 * The UEFA competitions are the honest case for this state. A Dixon-Coles fit
 * estimates team strength *within* a league's own scoring environment, and
 * nothing in the training corpus contains a Champions League match, so there
 * is no evidence that a Premier League attack rating and a Primeira Liga
 * defence rating are on the same scale. The model would happily produce a
 * number; that number has no validated meaning. Admin can inspect them,
 * customers cannot see them, and promoting them requires a cross-league
 * validation that does not exist yet.
 */
function experimental(
  canonicalCode: string,
  displayName: string,
  countryCode: string,
  reasonCodes: readonly string[],
): CompetitionPolicyEntry {
  return {
    canonicalCode,
    sportCode: "FOOTBALL",
    displayName,
    countryCode,
    tier: 1,
    state: "EXPERIMENTAL",
    modelEligible: false,
    customerVisible: false,
    minHistoricalSample: DEFAULT_MIN_HISTORICAL_SAMPLE,
    minBookmakerCoverage: DEFAULT_MIN_BOOKMAKER_COVERAGE,
    reasonCodes,
  };
}

export const FOOTBALL_COMPETITION_POLICY: readonly CompetitionPolicyEntry[] =
  Object.freeze([
    prime("ENG_PREMIER_LEAGUE", "Premier League", "GB", 1),
    prime("ESP_LA_LIGA", "La Liga", "ES", 1),
    prime("ITA_SERIE_A", "Serie A", "IT", 1),
    prime("DEU_BUNDESLIGA", "Bundesliga", "DE", 1),
    prime("FRA_LIGUE_1", "Ligue 1", "FR", 1),
    supported("ENG_CHAMPIONSHIP", "Championship", "GB", 2),
    supported("NLD_EREDIVISIE", "Eredivisie", "NL", 1),
    supported("PRT_PRIMEIRA_LIGA", "Primeira Liga", "PT", 1),
    supported("BEL_PRO_LEAGUE", "Belgian Pro League", "BE", 1),
    supported("TUR_SUPER_LIG", "Süper Lig", "TR", 1),
    supported("GRC_SUPER_LEAGUE", "Super League", "GR", 1),
    experimental("UEFA_CHAMPIONS_LEAGUE", "UEFA Champions League", "EU", [
      "NO_HISTORICAL_CORPUS",
      "CROSS_LEAGUE_STRENGTH_UNVALIDATED",
    ]),
    experimental("UEFA_EUROPA_LEAGUE", "UEFA Europa League", "EU", [
      "NO_HISTORICAL_CORPUS",
      "CROSS_LEAGUE_STRENGTH_UNVALIDATED",
    ]),
    experimental("UEFA_CONFERENCE_LEAGUE", "UEFA Conference League", "EU", [
      "NO_HISTORICAL_CORPUS",
      "CROSS_LEAGUE_STRENGTH_UNVALIDATED",
    ]),
  ]);

/**
 * Football-Data.co.uk division code to canonical competition.
 *
 * Only the divisions in the initial universe are mapped. Everything else the
 * publisher ships — the lower English tiers, the Scottish leagues, the second
 * divisions — stays unmapped on purpose: an unmapped competition is not an
 * error, it is a competition with no policy, and the resolver below treats
 * that as ineligible rather than guessing.
 */
export const FOOTBALL_DATA_DIVISIONS: Readonly<Record<string, string>> =
  Object.freeze({
    E0: "ENG_PREMIER_LEAGUE",
    E1: "ENG_CHAMPIONSHIP",
    SP1: "ESP_LA_LIGA",
    I1: "ITA_SERIE_A",
    D1: "DEU_BUNDESLIGA",
    F1: "FRA_LIGUE_1",
    N1: "NLD_EREDIVISIE",
    P1: "PRT_PRIMEIRA_LIGA",
    B1: "BEL_PRO_LEAGUE",
    T1: "TUR_SUPER_LIG",
    G1: "GRC_SUPER_LEAGUE",
  });

/**
 * API-Sports league names for the same competitions.
 *
 * Keyed by name because that is all `normalizeFootballFixture` currently
 * carries into the catalog. Names are ambiguous across countries — "Premier
 * League" exists in a dozen of them — so a match here is only accepted
 * together with the country the provider reported. `resolveCanonicalCode`
 * enforces that; a name-only match resolves to nothing.
 */
export const API_SPORTS_COMPETITIONS: readonly Readonly<{
  name: string;
  countryCode: string;
  canonicalCode: string;
}>[] = Object.freeze([
  {
    name: "premier league",
    countryCode: "GB",
    canonicalCode: "ENG_PREMIER_LEAGUE",
  },
  {
    name: "championship",
    countryCode: "GB",
    canonicalCode: "ENG_CHAMPIONSHIP",
  },
  { name: "la liga", countryCode: "ES", canonicalCode: "ESP_LA_LIGA" },
  { name: "serie a", countryCode: "IT", canonicalCode: "ITA_SERIE_A" },
  { name: "bundesliga", countryCode: "DE", canonicalCode: "DEU_BUNDESLIGA" },
  { name: "ligue 1", countryCode: "FR", canonicalCode: "FRA_LIGUE_1" },
  { name: "eredivisie", countryCode: "NL", canonicalCode: "NLD_EREDIVISIE" },
  {
    name: "primeira liga",
    countryCode: "PT",
    canonicalCode: "PRT_PRIMEIRA_LIGA",
  },
  {
    name: "jupiler pro league",
    countryCode: "BE",
    canonicalCode: "BEL_PRO_LEAGUE",
  },
  { name: "super lig", countryCode: "TR", canonicalCode: "TUR_SUPER_LIG" },
  {
    name: "super league 1",
    countryCode: "GR",
    canonicalCode: "GRC_SUPER_LEAGUE",
  },
  {
    name: "uefa champions league",
    countryCode: "EU",
    canonicalCode: "UEFA_CHAMPIONS_LEAGUE",
  },
  {
    name: "uefa europa league",
    countryCode: "EU",
    canonicalCode: "UEFA_EUROPA_LEAGUE",
  },
  {
    name: "uefa europa conference league",
    countryCode: "EU",
    canonicalCode: "UEFA_CONFERENCE_LEAGUE",
  },
]);

/**
 * Competition names that are excluded from customer intelligence regardless of
 * anything else, because the model has no basis for them.
 *
 * These are patterns rather than a list because a provider invents new
 * age-group and reserve competitions constantly, and a list would silently let
 * each new one through. Matching is on the competition name, and a match means
 * "not customer intelligence" — the events stay in the database, stay in
 * admin, and stay in the provider's raw coverage.
 */
export const NON_ELIGIBLE_NAME_PATTERNS: readonly RegExp[] = Object.freeze([
  /\bu-?(?:1[5-9]|2[0-3])\b/i,
  /\b(?:youth|junior|juvenil|primavera|academy)\b/i,
  /\b(?:reserve|reserves|regionalliga|oberliga)\b/i,
  /\b(?:ii|b)\s*team\b/i,
  /\bwomen'?s?\b/i,
  /\bfriendl(?:y|ies)\b/i,
  /\b(?:amateur|semi-?pro)\b/i,
]);

export function isNonEligibleCompetitionName(name: string): boolean {
  return NON_ELIGIBLE_NAME_PATTERNS.some((pattern) => pattern.test(name));
}

const POLICY_BY_CODE: ReadonlyMap<string, CompetitionPolicyEntry> = new Map(
  FOOTBALL_COMPETITION_POLICY.map((entry) => [entry.canonicalCode, entry]),
);

export function competitionPolicy(
  canonicalCode: string | null,
): CompetitionPolicyEntry | null {
  return canonicalCode === null
    ? null
    : (POLICY_BY_CODE.get(canonicalCode) ?? null);
}

/** `Süper Lig` and `Super Lig` are the same competition; `Süper` is not ASCII. */
export function normalizeCompetitionName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export type CanonicalResolution =
  | Readonly<{ ok: true; canonicalCode: string }>
  | Readonly<{
      ok: false;
      reason:
        | "NAME_NOT_MAPPED"
        | "COUNTRY_MISMATCH"
        | "COUNTRY_UNKNOWN"
        | "NAME_AMBIGUOUS"
        | "NON_ELIGIBLE_COMPETITION_TYPE";
      /** Present when the name matched but under other countries. */
      candidates?: readonly string[];
    }>;

/**
 * Resolves a provider's competition to a canonical code, or explains why it
 * could not.
 *
 * Fails closed in every uncertain case, and says which case it was. A caller
 * that cannot distinguish "we have never mapped this" from "we mapped it but
 * the country disagrees" cannot report a useful funnel reason, and a funnel
 * whose reasons are all "ineligible" tells the owner nothing.
 */
export function resolveCanonicalCode(
  input: Readonly<{
    sourceCode: "FOOTBALL_DATA_UK" | "API_SPORTS";
    /** Division code for Football-Data; league name for API-Sports. */
    sourceKey: string;
    /** ISO 3166-1 alpha-2, or null when the provider did not report one. */
    countryCode: string | null;
  }>,
): CanonicalResolution {
  if (input.sourceCode === "FOOTBALL_DATA_UK") {
    const canonicalCode = FOOTBALL_DATA_DIVISIONS[input.sourceKey.trim()];
    return canonicalCode === undefined
      ? { ok: false, reason: "NAME_NOT_MAPPED" }
      : { ok: true, canonicalCode };
  }

  if (isNonEligibleCompetitionName(input.sourceKey))
    return { ok: false, reason: "NON_ELIGIBLE_COMPETITION_TYPE" };

  const normalized = normalizeCompetitionName(input.sourceKey);
  const byName = API_SPORTS_COMPETITIONS.filter(
    (entry) => entry.name === normalized,
  );
  if (byName.length === 0) return { ok: false, reason: "NAME_NOT_MAPPED" };
  if (input.countryCode === null)
    return {
      ok: false,
      reason: "COUNTRY_UNKNOWN",
      candidates: byName.map((entry) => entry.canonicalCode),
    };
  const country = input.countryCode.trim().toUpperCase();
  const matches = byName.filter((entry) => entry.countryCode === country);
  if (matches.length === 0)
    return {
      ok: false,
      reason: "COUNTRY_MISMATCH",
      candidates: byName.map((entry) => entry.canonicalCode),
    };
  if (matches.length > 1)
    return {
      ok: false,
      reason: "NAME_AMBIGUOUS",
      candidates: matches.map((entry) => entry.canonicalCode),
    };
  return { ok: true, canonicalCode: matches[0]!.canonicalCode };
}

export type EligibilityDecision = Readonly<{
  state: CompetitionState;
  modelEligible: boolean;
  customerVisible: boolean;
  reasonCodes: readonly string[];
}>;

/**
 * The final say on whether one competition's markets may become customer
 * intelligence, given what the corpus and the market actually provide.
 *
 * A manual administrator override can only ever *narrow* eligibility, never
 * widen it past the evidence: an override to PRIME on a competition with no
 * historical sample would be a way to publish an unvalidated model through a
 * config change, which is exactly what the maturity policy exists to prevent.
 */
export function decideEligibility(
  input: Readonly<{
    canonicalCode: string | null;
    competitionName: string;
    historicalSample: number;
    bookmakerCoverage: number;
    manualOverride?: CompetitionState | null;
  }>,
): EligibilityDecision {
  const excluded = (reasonCodes: readonly string[]): EligibilityDecision => ({
    state: "EXCLUDED",
    modelEligible: false,
    customerVisible: false,
    reasonCodes,
  });

  if (isNonEligibleCompetitionName(input.competitionName))
    return excluded(["NON_ELIGIBLE_COMPETITION_TYPE"]);

  const policy = competitionPolicy(input.canonicalCode);
  if (!policy) return excluded(["COMPETITION_NOT_IN_POLICY"]);

  const reasonCodes: string[] = [];
  let state = policy.state;
  if (input.historicalSample < policy.minHistoricalSample) {
    reasonCodes.push("INSUFFICIENT_HISTORICAL_SAMPLE");
    state = "ADMIN_ONLY";
  }
  if (input.bookmakerCoverage < policy.minBookmakerCoverage) {
    reasonCodes.push("INSUFFICIENT_BOOKMAKER_COVERAGE");
    state = "ADMIN_ONLY";
  }
  if (!policy.modelEligible) reasonCodes.push(...policy.reasonCodes);

  const narrowing: readonly CompetitionState[] = [
    "PRIME",
    "SUPPORTED",
    "EXPERIMENTAL",
    "ADMIN_ONLY",
    "EXCLUDED",
  ];
  if (input.manualOverride) {
    const current = narrowing.indexOf(state);
    const requested = narrowing.indexOf(input.manualOverride);
    if (requested > current) {
      state = input.manualOverride;
      reasonCodes.push("ADMIN_OVERRIDE_NARROWED");
    } else reasonCodes.push("ADMIN_OVERRIDE_IGNORED_WOULD_WIDEN");
  }

  const eligibleStates: readonly CompetitionState[] = ["PRIME", "SUPPORTED"];
  const customerVisible = eligibleStates.includes(state);
  return {
    state,
    modelEligible: customerVisible && policy.modelEligible,
    customerVisible,
    reasonCodes: reasonCodes.length > 0 ? reasonCodes : ["POLICY_SATISFIED"],
  };
}
