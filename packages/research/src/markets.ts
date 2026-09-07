import type { FittedModel } from "./dixon-coles.js";

/**
 * The score distribution, and every supported market read off it.
 *
 * This module is the reason the three markets cannot disagree. There is one
 * matrix of scoreline probabilities per match; 1X2 is a partition of it by
 * sign of the goal difference, totals by the sum, both-teams-to-score by
 * whether each side's count is positive. Three partitions of one normalized
 * matrix each sum to exactly one, and all three describe the same match.
 */

/**
 * Scorelines are truncated at 10 goals per side.
 *
 * The tail beyond that carries less than a millionth of the mass at any
 * realistic expected-goals value, and the matrix is renormalized afterwards,
 * so truncation shifts probabilities by far less than the model's own
 * uncertainty. Renormalizing is also what repairs the τ correction, which is
 * not a probability-preserving transform.
 */
export const MAX_GOALS = 10;

export type ScoreDistribution = Readonly<{
  /** `matrix[home][away]`, summing to exactly 1 up to floating-point error. */
  matrix: readonly (readonly number[])[];
  homeExpectedGoals: number;
  awayExpectedGoals: number;
  /** Mass discarded by truncation before renormalizing; a diagnostic. */
  truncatedMass: number;
}>;

function poissonPmf(count: number, rate: number): number {
  let logPmf = -rate + count * Math.log(rate);
  for (let index = 2; index <= count; index += 1) logPmf -= Math.log(index);
  return Math.exp(logPmf);
}

function tauValue(
  homeGoals: number,
  awayGoals: number,
  lambda: number,
  mu: number,
  rho: number,
): number {
  if (homeGoals === 0 && awayGoals === 0) return 1 - lambda * mu * rho;
  if (homeGoals === 0 && awayGoals === 1) return 1 + lambda * rho;
  if (homeGoals === 1 && awayGoals === 0) return 1 + mu * rho;
  if (homeGoals === 1 && awayGoals === 1) return 1 - rho;
  return 1;
}

export type ExpectedGoals = Readonly<{ lambda: number; mu: number }>;

export type TeamRatingLookup = Readonly<{
  competitionCode: string;
  homeTeamKey: string;
  awayTeamKey: string;
}>;

export type ExpectedGoalsResolution =
  | Readonly<{ ok: true; value: ExpectedGoals }>
  | Readonly<{
      ok: false;
      reason: "COMPETITION_NOT_IN_MODEL" | "TEAM_NOT_IN_MODEL";
      detail: string;
    }>;

/**
 * Resolves the two expected goal counts, or refuses.
 *
 * Refusing matters more than it looks. A missing team is not a small
 * inconvenience to be papered over with a league-average rating: a promoted
 * club given the average of the division it has just entered would be priced
 * as a mid-table side, and the model would report a confident edge built on an
 * assumption nobody made deliberately. No rating, no prediction.
 */
export function resolveExpectedGoals(
  model: FittedModel,
  lookup: TeamRatingLookup,
): ExpectedGoalsResolution {
  const competition = model.competitions.find(
    (entry) => entry.competitionCode === lookup.competitionCode,
  );
  if (!competition)
    return {
      ok: false,
      reason: "COMPETITION_NOT_IN_MODEL",
      detail: lookup.competitionCode,
    };
  const home = model.teams.find(
    (team) =>
      team.competitionCode === lookup.competitionCode &&
      team.teamKey === lookup.homeTeamKey,
  );
  const away = model.teams.find(
    (team) =>
      team.competitionCode === lookup.competitionCode &&
      team.teamKey === lookup.awayTeamKey,
  );
  if (!home || !away)
    return {
      ok: false,
      reason: "TEAM_NOT_IN_MODEL",
      detail: !home ? lookup.homeTeamKey : lookup.awayTeamKey,
    };
  return {
    ok: true,
    value: {
      lambda: Math.exp(
        competition.base +
          home.attack -
          away.defence +
          competition.homeAdvantage,
      ),
      mu: Math.exp(competition.base + away.attack - home.defence),
    },
  };
}

export function scoreDistribution(
  expected: ExpectedGoals,
  rho: number,
): ScoreDistribution {
  const homeMarginal: number[] = [];
  const awayMarginal: number[] = [];
  for (let goals = 0; goals <= MAX_GOALS; goals += 1) {
    homeMarginal.push(poissonPmf(goals, expected.lambda));
    awayMarginal.push(poissonPmf(goals, expected.mu));
  }
  const raw: number[][] = [];
  let total = 0;
  for (let home = 0; home <= MAX_GOALS; home += 1) {
    const row: number[] = [];
    for (let away = 0; away <= MAX_GOALS; away += 1) {
      const cell =
        Math.max(0, tauValue(home, away, expected.lambda, expected.mu, rho)) *
        (homeMarginal[home] ?? 0) *
        (awayMarginal[away] ?? 0);
      row.push(cell);
      total += cell;
    }
    raw.push(row);
  }
  const scale = total > 0 ? 1 / total : 0;
  return {
    matrix: raw.map((row) => row.map((cell) => cell * scale)),
    homeExpectedGoals: expected.lambda,
    awayExpectedGoals: expected.mu,
    truncatedMass: Math.max(0, 1 - total),
  };
}

export type MatchResultProbabilities = Readonly<{
  home: number;
  draw: number;
  away: number;
}>;

export function matchResultProbabilities(
  distribution: ScoreDistribution,
): MatchResultProbabilities {
  let home = 0;
  let draw = 0;
  let away = 0;
  distribution.matrix.forEach((row, homeGoals) => {
    row.forEach((cell, awayGoals) => {
      if (homeGoals > awayGoals) home += cell;
      else if (homeGoals < awayGoals) away += cell;
      else draw += cell;
    });
  });
  return { home, draw, away };
}

export type TotalGoalsProbabilities = Readonly<{ over: number; under: number }>;

/**
 * Only half-integer lines are accepted, because only they partition the
 * scorelines without a push. A whole-goal line makes "exactly the line" a
 * third outcome that neither side of an over/under market settles, and this
 * function has no way to represent it — so it is rejected rather than silently
 * folded into one side.
 */
export function totalGoalsProbabilities(
  distribution: ScoreDistribution,
  line: number,
): TotalGoalsProbabilities | null {
  if (
    !Number.isFinite(line) ||
    Math.abs(line * 2 - Math.round(line * 2)) > 1e-9
  )
    return null;
  if (Number.isInteger(line)) return null;
  let over = 0;
  let under = 0;
  distribution.matrix.forEach((row, homeGoals) => {
    row.forEach((cell, awayGoals) => {
      if (homeGoals + awayGoals > line) over += cell;
      else under += cell;
    });
  });
  return { over, under };
}

export type BothTeamsToScoreProbabilities = Readonly<{
  yes: number;
  no: number;
}>;

export function bothTeamsToScoreProbabilities(
  distribution: ScoreDistribution,
): BothTeamsToScoreProbabilities {
  let yes = 0;
  let no = 0;
  distribution.matrix.forEach((row, homeGoals) => {
    row.forEach((cell, awayGoals) => {
      if (homeGoals > 0 && awayGoals > 0) yes += cell;
      else no += cell;
    });
  });
  return { yes, no };
}

export type MarketProbabilitySet = Readonly<{
  matchResult: MatchResultProbabilities;
  totalGoals2_5: TotalGoalsProbabilities;
  bothTeamsToScore: BothTeamsToScoreProbabilities;
  distribution: ScoreDistribution;
}>;

export function marketProbabilities(
  model: FittedModel,
  lookup: TeamRatingLookup,
):
  | Readonly<{ ok: true; value: MarketProbabilitySet }>
  | Readonly<{ ok: false; reason: string; detail: string }> {
  const expected = resolveExpectedGoals(model, lookup);
  if (!expected.ok)
    return { ok: false, reason: expected.reason, detail: expected.detail };
  const distribution = scoreDistribution(expected.value, model.rho);
  const totals = totalGoalsProbabilities(distribution, 2.5);
  if (!totals)
    return { ok: false, reason: "INVALID_TOTAL_LINE", detail: "2.5" };
  return {
    ok: true,
    value: {
      matchResult: matchResultProbabilities(distribution),
      totalGoals2_5: totals,
      bothTeamsToScore: bothTeamsToScoreProbabilities(distribution),
      distribution,
    },
  };
}

/**
 * Renders a set of probabilities as fixed-scale decimal strings that still sum
 * to exactly one.
 *
 * Rounding each probability independently to twelve places does not preserve
 * the sum, and the database's own check constraints plus every downstream
 * decimal comparison assume a coherent set. The residual is given to the
 * largest member, where it is proportionally smallest — a shift of at most
 * 1e-12 on the outcome least sensitive to it.
 */
export function toCoherentDecimals(
  probabilities: readonly number[],
  scale = 12,
): readonly string[] {
  const factor = 10 ** scale;
  const rounded = probabilities.map((value) =>
    Math.round(Math.min(1, Math.max(0, value)) * factor),
  );
  const total = rounded.reduce((sum, value) => sum + value, 0);
  const residual = factor - total;
  if (residual !== 0 && rounded.length > 0) {
    let largest = 0;
    for (let index = 1; index < rounded.length; index += 1)
      if ((rounded[index] ?? 0) > (rounded[largest] ?? 0)) largest = index;
    rounded[largest] = Math.max(0, (rounded[largest] ?? 0) + residual);
  }
  return rounded.map((value) => (value / factor).toFixed(scale));
}
