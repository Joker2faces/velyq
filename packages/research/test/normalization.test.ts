import { describe, expect, it } from "vitest";
import {
  COMPETITION_POLICY_VERSION,
  DEFAULT_MIN_BOOKMAKER_COVERAGE,
  DEFAULT_MIN_HISTORICAL_SAMPLE,
  FOOTBALL_COMPETITION_POLICY,
  FOOTBALL_DATA_DIVISIONS,
  competitionPolicy,
  decideEligibility,
  isNonEligibleCompetitionName,
  normalizeCompetitionName,
  normalizeTeamKey,
  resolveCanonicalCode,
  resolveTeam,
  TEAM_ALIASES,
} from "../src/index.js";

describe("competition name normalization", () => {
  it("folds case, punctuation and accents", () => {
    expect(normalizeCompetitionName("Süper Lig")).toBe("super lig");
    expect(normalizeCompetitionName("Super League 1")).toBe("super league 1");
    expect(normalizeCompetitionName("  Ligue-1  ")).toBe("ligue 1");
  });
});

describe("resolving a provider competition to a canonical code", () => {
  it("maps every Football-Data division in the initial universe", () => {
    for (const [division, canonicalCode] of Object.entries(
      FOOTBALL_DATA_DIVISIONS,
    )) {
      const resolution = resolveCanonicalCode({
        sourceCode: "FOOTBALL_DATA_UK",
        sourceKey: division,
        countryCode: null,
      });
      expect(resolution.ok).toBe(true);
      if (resolution.ok) expect(resolution.canonicalCode).toBe(canonicalCode);
      // Every mapped division must also have a policy, or the resolver
      // resolves to something nothing can decide about.
      expect(competitionPolicy(canonicalCode)).not.toBeNull();
    }
  });

  it("leaves the divisions outside the initial universe unmapped", () => {
    // Not an error: a competition with no policy is ineligible, which is what
    // fails closed. Guessing at E2 or SC0 would be the bug.
    for (const division of ["E2", "E3", "EC", "SC0", "SP2", "I2", "D2", "F2"]) {
      expect(
        resolveCanonicalCode({
          sourceCode: "FOOTBALL_DATA_UK",
          sourceKey: division,
          countryCode: null,
        }),
      ).toEqual({ ok: false, reason: "NAME_NOT_MAPPED" });
    }
  });

  it("requires a country for an API-Sports league name", () => {
    // "Premier League" exists in a dozen countries. A name-only match would
    // put Egyptian fixtures through an English model.
    expect(
      resolveCanonicalCode({
        sourceCode: "API_SPORTS",
        sourceKey: "Premier League",
        countryCode: "GB",
      }),
    ).toEqual({ ok: true, canonicalCode: "ENG_PREMIER_LEAGUE" });

    const noCountry = resolveCanonicalCode({
      sourceCode: "API_SPORTS",
      sourceKey: "Premier League",
      countryCode: null,
    });
    expect(noCountry.ok).toBe(false);
    if (!noCountry.ok) expect(noCountry.reason).toBe("COUNTRY_UNKNOWN");

    const wrongCountry = resolveCanonicalCode({
      sourceCode: "API_SPORTS",
      sourceKey: "Premier League",
      countryCode: "EG",
    });
    expect(wrongCountry.ok).toBe(false);
    if (!wrongCountry.ok) {
      expect(wrongCountry.reason).toBe("COUNTRY_MISMATCH");
      // The funnel needs to be able to say *which* competition it nearly was.
      expect(wrongCountry.candidates).toEqual(["ENG_PREMIER_LEAGUE"]);
    }
  });

  it("rejects age-group, reserve, women's and friendly competitions outright", () => {
    for (const name of [
      "Premier League U21",
      "U-19 Bundesliga",
      "Serie A Primavera",
      "Bayern Munich II Team",
      "Club Friendlies",
      "Regionalliga Bayern",
      "Women's Super League",
    ]) {
      expect(isNonEligibleCompetitionName(name)).toBe(true);
      const resolution = resolveCanonicalCode({
        sourceCode: "API_SPORTS",
        sourceKey: name,
        countryCode: "DE",
      });
      expect(resolution.ok).toBe(false);
      if (!resolution.ok)
        expect(resolution.reason).toBe("NON_ELIGIBLE_COMPETITION_TYPE");
    }
  });

  it("does not mistake a senior competition for a youth one", () => {
    for (const name of [
      "Premier League",
      "La Liga",
      "Bundesliga",
      "Super League 1",
      "UEFA Champions League",
    ])
      expect(isNonEligibleCompetitionName(name)).toBe(false);
  });
});

describe("eligibility", () => {
  const evidence = {
    historicalSample: DEFAULT_MIN_HISTORICAL_SAMPLE,
    bookmakerCoverage: DEFAULT_MIN_BOOKMAKER_COVERAGE,
  };

  it("has a stable policy version and no duplicate codes", () => {
    expect(COMPETITION_POLICY_VERSION).toBe("competition-policy.v1");
    const codes = FOOTBALL_COMPETITION_POLICY.map(
      (entry) => entry.canonicalCode,
    );
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("admits a PRIME competition with the evidence behind it", () => {
    expect(
      decideEligibility({
        canonicalCode: "ENG_PREMIER_LEAGUE",
        competitionName: "Premier League",
        ...evidence,
      }),
    ).toEqual({
      state: "PRIME",
      modelEligible: true,
      customerVisible: true,
      reasonCodes: ["POLICY_SATISFIED"],
    });
  });

  it("demotes a competition with too little history to admin only", () => {
    const decision = decideEligibility({
      canonicalCode: "ENG_PREMIER_LEAGUE",
      competitionName: "Premier League",
      historicalSample: 200,
      bookmakerCoverage: DEFAULT_MIN_BOOKMAKER_COVERAGE,
    });
    expect(decision.state).toBe("ADMIN_ONLY");
    expect(decision.customerVisible).toBe(false);
    expect(decision.reasonCodes).toContain("INSUFFICIENT_HISTORICAL_SAMPLE");
  });

  it("demotes a competition nobody prices deeply enough", () => {
    const decision = decideEligibility({
      canonicalCode: "ENG_PREMIER_LEAGUE",
      competitionName: "Premier League",
      historicalSample: DEFAULT_MIN_HISTORICAL_SAMPLE,
      bookmakerCoverage: 1,
    });
    expect(decision.state).toBe("ADMIN_ONLY");
    expect(decision.reasonCodes).toContain("INSUFFICIENT_BOOKMAKER_COVERAGE");
  });

  it("excludes a competition with no policy at all", () => {
    expect(
      decideEligibility({
        canonicalCode: null,
        competitionName: "Somewhere Regional Cup",
        ...evidence,
      }),
    ).toEqual({
      state: "EXCLUDED",
      modelEligible: false,
      customerVisible: false,
      reasonCodes: ["COMPETITION_NOT_IN_POLICY"],
    });
  });

  it("keeps the UEFA competitions out of customer intelligence and says why", () => {
    // The model would happily produce a number for a Champions League tie;
    // nothing in the corpus establishes that a Premier League attack rating
    // and a Primeira Liga defence rating are on the same scale.
    const decision = decideEligibility({
      canonicalCode: "UEFA_CHAMPIONS_LEAGUE",
      competitionName: "UEFA Champions League",
      ...evidence,
    });
    expect(decision.customerVisible).toBe(false);
    expect(decision.modelEligible).toBe(false);
    expect(decision.reasonCodes).toContain("CROSS_LEAGUE_STRENGTH_UNVALIDATED");
  });

  it("lets an administrator narrow eligibility", () => {
    const decision = decideEligibility({
      canonicalCode: "ENG_PREMIER_LEAGUE",
      competitionName: "Premier League",
      ...evidence,
      manualOverride: "ADMIN_ONLY",
    });
    expect(decision.state).toBe("ADMIN_ONLY");
    expect(decision.customerVisible).toBe(false);
    expect(decision.reasonCodes).toContain("ADMIN_OVERRIDE_NARROWED");
  });

  it("refuses an override that would widen eligibility past the evidence", () => {
    // Otherwise a configuration change is a way to publish an unvalidated
    // model, which is exactly what the maturity policy exists to prevent.
    const decision = decideEligibility({
      canonicalCode: "ENG_PREMIER_LEAGUE",
      competitionName: "Premier League",
      historicalSample: 10,
      bookmakerCoverage: DEFAULT_MIN_BOOKMAKER_COVERAGE,
      manualOverride: "PRIME",
    });
    expect(decision.state).toBe("ADMIN_ONLY");
    expect(decision.customerVisible).toBe(false);
    expect(decision.reasonCodes).toContain(
      "ADMIN_OVERRIDE_IGNORED_WOULD_WIDEN",
    );
  });

  it("cannot be overridden into eligibility for an excluded competition type", () => {
    const decision = decideEligibility({
      canonicalCode: "ENG_PREMIER_LEAGUE",
      competitionName: "Premier League U21",
      ...evidence,
      manualOverride: "PRIME",
    });
    expect(decision.state).toBe("EXCLUDED");
    expect(decision.customerVisible).toBe(false);
  });
});

describe("team identity", () => {
  it("folds case, punctuation and accents into a stable key", () => {
    expect(normalizeTeamKey("Nott'm Forest")).toBe("nott-m-forest");
    expect(normalizeTeamKey("Nîmes")).toBe("nimes");
    expect(normalizeTeamKey("St. Gilloise")).toBe("st-gilloise");
    expect(normalizeTeamKey("  Man   United ")).toBe("man-united");
  });

  it("does not collapse clubs that merely share a club-type word", () => {
    // Stripping FC/CF/AC/Sporting looks harmless and merges real clubs.
    expect(normalizeTeamKey("Sporting Lisbon")).not.toBe(
      normalizeTeamKey("Sporting Gijon"),
    );
    expect(normalizeTeamKey("Ath Bilbao")).not.toBe(
      normalizeTeamKey("Ath Madrid"),
    );
  });

  it("resolves a name the model already knows without touching the alias table", () => {
    const known = new Set(["man-united", "fulham"]);
    expect(
      resolveTeam({
        canonicalCompetitionCode: "ENG_PREMIER_LEAGUE",
        sourceName: "Man United",
        knownTeamKeys: known,
      }),
    ).toEqual({ status: "RESOLVED", teamKey: "man-united", via: "EXACT" });
  });

  it("resolves a listed alias to the name the corpus uses", () => {
    const known = new Set(["man-united"]);
    expect(
      resolveTeam({
        canonicalCompetitionCode: "ENG_PREMIER_LEAGUE",
        sourceName: "Manchester United",
        knownTeamKeys: known,
      }),
    ).toEqual({ status: "RESOLVED", teamKey: "man-united", via: "ALIAS" });
  });

  it("quarantines an unknown name instead of guessing at the nearest one", () => {
    // "Manchester City" is two edits from "Manchester United". A fuzzy match
    // here would silently price one club with the other's ratings.
    const known = new Set(["man-united"]);
    const resolution = resolveTeam({
      canonicalCompetitionCode: "ENG_PREMIER_LEAGUE",
      sourceName: "Manchester City",
      knownTeamKeys: known,
    });
    expect(resolution.status).toBe("QUARANTINED");
    if (resolution.status === "QUARANTINED")
      expect(resolution.reason).toBe("UNKNOWN_TEAM");
  });

  it("quarantines a team the model has never been fitted on", () => {
    // The newly-promoted-club case. There is no attack rating to price with,
    // so it has to fail closed rather than fall back to anything.
    const resolution = resolveTeam({
      canonicalCompetitionCode: "ENG_PREMIER_LEAGUE",
      sourceName: "Manchester United",
      knownTeamKeys: new Set(["fulham"]),
    });
    expect(resolution.status).toBe("QUARANTINED");
  });

  it("scopes aliases to a competition so one country's short name cannot resolve another's", () => {
    const known = new Set(["man-united"]);
    const wrongCompetition = resolveTeam({
      canonicalCompetitionCode: "ESP_LA_LIGA",
      sourceName: "Manchester United",
      knownTeamKeys: known,
    });
    expect(wrongCompetition.status).toBe("QUARANTINED");
  });

  it("keeps the alias table free of contradictions", () => {
    const seen = new Map<string, string>();
    for (const entry of TEAM_ALIASES) {
      const key = `${entry.canonicalCompetitionCode}|${normalizeTeamKey(entry.alias)}`;
      const corpus = normalizeTeamKey(entry.corpusName);
      const existing = seen.get(key);
      // One alias must never point at two different corpus teams.
      if (existing !== undefined) expect(existing).toBe(corpus);
      seen.set(key, corpus);
      // And every alias must belong to a competition that has a policy.
      expect(competitionPolicy(entry.canonicalCompetitionCode)).not.toBeNull();
    }
  });
});
