import { describe, expect, it } from "vitest";
import {
  bothTeamsToScoreProbabilities,
  fitDixonColes,
  leakageViolations,
  marketProbabilities,
  matchResultProbabilities,
  MAX_GOALS,
  resolveExpectedGoals,
  scoreDistribution,
  toCoherentDecimals,
  totalGoalsProbabilities,
  type TrainingMatch,
} from "../src/index.js";

/**
 * A small deterministic league. Not a fixture of real results — a synthetic
 * schedule whose only job is to exercise the fit and the invariants. Every
 * probability claim below is a property of the maths, not of this data.
 */
function syntheticLeague(): readonly TrainingMatch[] {
  const teams = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot"];
  const strength: Record<string, number> = {
    alpha: 2.4,
    bravo: 1.9,
    charlie: 1.5,
    delta: 1.2,
    echo: 1.0,
    foxtrot: 0.7,
  };
  const matches: TrainingMatch[] = [];
  let day = 0;
  for (let round = 0; round < 6; round += 1)
    for (const home of teams)
      for (const away of teams) {
        if (home === away) continue;
        day += 1;
        const expectedHome = (strength[home] ?? 1) * 1.15;
        const expectedAway = strength[away] ?? 1;
        matches.push({
          competitionCode: "TEST_LEAGUE",
          homeTeamKey: home,
          awayTeamKey: away,
          homeGoals: Math.round(expectedHome) % 5,
          awayGoals: Math.round(expectedAway) % 5,
          kickoffDate: new Date(Date.UTC(2020, 0, 1) + day * 86_400_000)
            .toISOString()
            .slice(0, 10),
        });
      }
  return matches;
}

const league = syntheticLeague();
const model = fitDixonColes({
  matches: league,
  trainingCutoff: "2026-01-01",
});

describe("fitting", () => {
  it("estimates one rating pair per team per competition", () => {
    expect(model.teams).toHaveLength(6);
    expect(new Set(model.teams.map((team) => team.competitionCode))).toEqual(
      new Set(["TEST_LEAGUE"]),
    );
    expect(model.competitions).toHaveLength(1);
  });

  it("keeps attack and defence identified by centring them within the competition", () => {
    // Without this the fit wanders along a flat direction the competition
    // baseline can absorb, and the ratings stop being comparable at all.
    const attackMean =
      model.teams.reduce((sum, team) => sum + team.attack, 0) /
      model.teams.length;
    const defenceMean =
      model.teams.reduce((sum, team) => sum + team.defence, 0) /
      model.teams.length;
    expect(Math.abs(attackMean)).toBeLessThan(1e-9);
    expect(Math.abs(defenceMean)).toBeLessThan(1e-9);
  });

  it("is deterministic, so the same corpus fingerprints to the same model", () => {
    const again = fitDixonColes({
      matches: league,
      trainingCutoff: "2026-01-01",
    });
    expect(again.rho).toBe(model.rho);
    expect(again.logLikelihood).toBe(model.logLikelihood);
    expect(again.teams.map((team) => team.attack)).toEqual(
      model.teams.map((team) => team.attack),
    );
  });

  it("refuses to train on a match at or after its own cutoff", () => {
    // Silently dropping these would still produce a plausible model, and the
    // backtest built on it would report a score that had seen the future.
    expect(() =>
      fitDixonColes({ matches: league, trainingCutoff: "2020-06-01" }),
    ).toThrow(/TRAINING_DATA_AFTER_CUTOFF/);
    expect(leakageViolations(league, "2020-06-01").length).toBeGreaterThan(0);
    expect(leakageViolations(league, "2026-01-01")).toEqual([]);
  });

  it("returns an empty model rather than throwing on an empty corpus", () => {
    const empty = fitDixonColes({ matches: [], trainingCutoff: "2026-01-01" });
    expect(empty.teams).toEqual([]);
    expect(empty.matchesUsed).toBe(0);
    expect(empty.converged).toBe(false);
  });
});

describe("the score distribution", () => {
  const expected = resolveExpectedGoals(model, {
    competitionCode: "TEST_LEAGUE",
    homeTeamKey: "alpha",
    awayTeamKey: "foxtrot",
  });
  if (!expected.ok) throw new Error("expected goals should resolve");
  const distribution = scoreDistribution(expected.value, model.rho);

  it("is a proper distribution over the truncated scoreline grid", () => {
    expect(distribution.matrix).toHaveLength(MAX_GOALS + 1);
    const total = distribution.matrix
      .flat()
      .reduce((sum, cell) => sum + cell, 0);
    expect(total).toBeCloseTo(1, 12);
    expect(distribution.matrix.flat().every((cell) => cell >= 0)).toBe(true);
  });

  it("gives the stronger home side more expected goals", () => {
    expect(distribution.homeExpectedGoals).toBeGreaterThan(
      distribution.awayExpectedGoals,
    );
  });
});

describe("market invariants", () => {
  const pairs: readonly [string, string][] = [
    ["alpha", "foxtrot"],
    ["foxtrot", "alpha"],
    ["charlie", "delta"],
    ["echo", "bravo"],
  ];

  for (const [home, away] of pairs) {
    it(`1X2 sums to exactly one for ${home} v ${away}`, () => {
      const result = marketProbabilities(model, {
        competitionCode: "TEST_LEAGUE",
        homeTeamKey: home,
        awayTeamKey: away,
      });
      if (!result.ok) throw new Error(result.reason);
      const { home: h, draw, away: a } = result.value.matchResult;
      expect(h + draw + a).toBeCloseTo(1, 12);
      expect(Math.min(h, draw, a)).toBeGreaterThan(0);
    });

    it(`over/under 2.5 sums to exactly one for ${home} v ${away}`, () => {
      const result = marketProbabilities(model, {
        competitionCode: "TEST_LEAGUE",
        homeTeamKey: home,
        awayTeamKey: away,
      });
      if (!result.ok) throw new Error(result.reason);
      const { over, under } = result.value.totalGoals2_5;
      expect(over + under).toBeCloseTo(1, 12);
    });

    it(`both-teams-to-score sums to exactly one for ${home} v ${away}`, () => {
      const result = marketProbabilities(model, {
        competitionCode: "TEST_LEAGUE",
        homeTeamKey: home,
        awayTeamKey: away,
      });
      if (!result.ok) throw new Error(result.reason);
      const { yes, no } = result.value.bothTeamsToScore;
      expect(yes + no).toBeCloseTo(1, 12);
    });
  }

  it("derives every market from the same matrix, so they cannot contradict", () => {
    const result = marketProbabilities(model, {
      competitionCode: "TEST_LEAGUE",
      homeTeamKey: "alpha",
      awayTeamKey: "bravo",
    });
    if (!result.ok) throw new Error(result.reason);
    const { distribution } = result.value;
    // Recomputing each partition from the matrix must reproduce exactly what
    // the bundle reported. This is the property that makes three market
    // models unnecessary.
    expect(matchResultProbabilities(distribution)).toEqual(
      result.value.matchResult,
    );
    expect(totalGoalsProbabilities(distribution, 2.5)).toEqual(
      result.value.totalGoals2_5,
    );
    expect(bothTeamsToScoreProbabilities(distribution)).toEqual(
      result.value.bothTeamsToScore,
    );
    // 0-0 is the one scoreline that is a draw, under 2.5 and BTTS-no at once,
    // so it is counted in exactly one member of each partition.
    const nilNil = distribution.matrix[0]?.[0] ?? 0;
    expect(nilNil).toBeGreaterThan(0);
    expect(result.value.totalGoals2_5.under).toBeGreaterThanOrEqual(nilNil);
    expect(result.value.bothTeamsToScore.no).toBeGreaterThanOrEqual(nilNil);
  });

  it("refuses a whole-goal total line, which no over/under market settles cleanly", () => {
    const expected = resolveExpectedGoals(model, {
      competitionCode: "TEST_LEAGUE",
      homeTeamKey: "alpha",
      awayTeamKey: "bravo",
    });
    if (!expected.ok) throw new Error("expected goals should resolve");
    const distribution = scoreDistribution(expected.value, model.rho);
    expect(totalGoalsProbabilities(distribution, 3)).toBeNull();
    expect(totalGoalsProbabilities(distribution, 3.5)).not.toBeNull();
  });

  it("reflects the Dixon-Coles correction in the low scorelines", () => {
    const expected = resolveExpectedGoals(model, {
      competitionCode: "TEST_LEAGUE",
      homeTeamKey: "charlie",
      awayTeamKey: "delta",
    });
    if (!expected.ok) throw new Error("expected goals should resolve");
    const corrected = scoreDistribution(expected.value, -0.1);
    const independent = scoreDistribution(expected.value, 0);
    // A negative rho is what the literature finds and what this corpus fits:
    // it lifts 0-0 and 1-1 above what independent Poisson marginals imply.
    expect(corrected.matrix[0]?.[0] ?? 0).toBeGreaterThan(
      independent.matrix[0]?.[0] ?? 0,
    );
    expect(corrected.matrix[1]?.[1] ?? 0).toBeGreaterThan(
      independent.matrix[1]?.[1] ?? 0,
    );
    // And both remain proper distributions.
    for (const candidate of [corrected, independent])
      expect(
        candidate.matrix.flat().reduce((sum, cell) => sum + cell, 0),
      ).toBeCloseTo(1, 12);
  });
});

describe("refusing to price what the model has not seen", () => {
  it("refuses an unknown team rather than substituting a league average", () => {
    // A promoted club given the division average would be priced as a
    // mid-table side, and the model would report a confident edge built on an
    // assumption nobody made deliberately.
    const result = marketProbabilities(model, {
      competitionCode: "TEST_LEAGUE",
      homeTeamKey: "alpha",
      awayTeamKey: "newcomer",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("TEAM_NOT_IN_MODEL");
  });

  it("refuses a competition the model was never fitted on", () => {
    const result = marketProbabilities(model, {
      competitionCode: "OTHER_LEAGUE",
      homeTeamKey: "alpha",
      awayTeamKey: "bravo",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("COMPETITION_NOT_IN_MODEL");
  });
});

describe("decimal rendering", () => {
  it("keeps a rounded probability set summing to exactly one", () => {
    // Rounding each member independently does not preserve the sum, and every
    // downstream decimal comparison and database check assumes a coherent set.
    const decimals = toCoherentDecimals([1 / 3, 1 / 3, 1 / 3], 12);
    const total = decimals.reduce((sum, value) => sum + Number(value), 0);
    expect(total).toBe(1);
    expect(decimals.every((value) => value.split(".")[1]?.length === 12)).toBe(
      true,
    );
  });

  it("gives the residual to the largest member, where it matters least", () => {
    const decimals = toCoherentDecimals([0.9, 0.0500000000004, 0.05], 6);
    expect(decimals.reduce((sum, value) => sum + Number(value), 0)).toBe(1);
    expect(Number(decimals[0])).toBeCloseTo(0.9, 5);
  });

  it("clamps out-of-range input rather than emitting an impossible probability", () => {
    const decimals = toCoherentDecimals([1.4, -0.4], 6);
    expect(decimals.every((value) => Number(value) >= 0)).toBe(true);
    expect(decimals.reduce((sum, value) => sum + Number(value), 0)).toBe(1);
  });
});
