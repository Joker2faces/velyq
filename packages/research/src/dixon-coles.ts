/**
 * A Dixon-Coles goals model: one coherent score distribution per match, from
 * which every supported market is derived.
 *
 * Why one score model rather than three market models. 1X2, over/under 2.5 and
 * both-teams-to-score are three views of the same thing — how many goals each
 * side scores — so three independently fitted classifiers can and will
 * contradict each other: a set of 1X2 probabilities implying a low-scoring
 * game alongside an over-2.5 probability implying a high-scoring one. Deriving
 * all three from a single joint distribution over scorelines makes that
 * contradiction unrepresentable rather than merely unlikely.
 *
 * The model, for a match between home team i and away team j in competition c:
 *
 *   log λ = base_c + attack_i - defence_j + homeAdvantage_c   (home goals)
 *   log μ = base_c + attack_j - defence_i                     (away goals)
 *
 * with the Dixon-Coles dependence correction τ applied to the four low
 * scorelines, where independent Poisson marginals are known to misprice draws:
 *
 *   τ(0,0) = 1 - λμρ   τ(0,1) = 1 + λρ
 *   τ(1,0) = 1 + μρ    τ(1,1) = 1 - ρ     τ = 1 elsewhere
 *
 * Fitting maximises the exact weighted log-likelihood by Adam on analytic
 * gradients. Full-batch and seedless, so the same corpus and hyperparameters
 * produce bit-identical parameters — which is what lets a model artifact be
 * fingerprinted and a prediction be reproduced from its recorded version.
 */

export type TrainingMatch = Readonly<{
  competitionCode: string;
  homeTeamKey: string;
  awayTeamKey: string;
  homeGoals: number;
  awayGoals: number;
  /** `YYYY-MM-DD`. Used for time decay and for the leakage guard. */
  kickoffDate: string;
}>;

export type Hyperparameters = Readonly<{
  /**
   * Exponential decay per day of match age. Older matches still inform the
   * fit, they just inform it less: a squad two years ago is only loosely
   * evidence about the squad today. 0 disables decay entirely.
   */
  timeDecayPerDay: number;
  /**
   * L2 shrinkage on attack and defence ratings toward zero, i.e. toward the
   * competition's average team. This is what keeps a promoted club with six
   * matches played from being handed an extreme rating.
   */
  ratingPenalty: number;
  maxIterations: number;
  learningRate: number;
  /** Relative log-likelihood improvement below which fitting stops. */
  tolerance: number;
}>;

export const DEFAULT_HYPERPARAMETERS: Hyperparameters = Object.freeze({
  timeDecayPerDay: 0.0022,
  ratingPenalty: 0.02,
  maxIterations: 500,
  learningRate: 0.06,
  tolerance: 1e-10,
});

export type FittedTeam = Readonly<{
  teamKey: string;
  competitionCode: string;
  attack: number;
  defence: number;
  /** Weighted match count behind this team's ratings. */
  sampleWeight: number;
  matches: number;
}>;

export type FittedCompetition = Readonly<{
  competitionCode: string;
  /** log of the average goals per team per match in this competition. */
  base: number;
  homeAdvantage: number;
  matches: number;
}>;

export type FittedModel = Readonly<{
  teams: readonly FittedTeam[];
  competitions: readonly FittedCompetition[];
  /** The shared low-score dependence parameter. */
  rho: number;
  hyperparameters: Hyperparameters;
  /** Exclusive: no match on or after this instant was used. */
  trainingCutoff: string;
  iterations: number;
  logLikelihood: number;
  converged: boolean;
  matchesUsed: number;
}>;

const MIN_RHO = -0.2;
const MAX_RHO = 0.2;

/**
 * τ, and its partial derivatives, for one scoreline.
 *
 * τ can go non-positive for extreme ρ, which would make the log-likelihood
 * undefined; ρ is clamped to a range where it cannot for any realistic λ, μ,
 * and the floor here is a second guard rather than the primary one.
 */
function tau(
  homeGoals: number,
  awayGoals: number,
  lambda: number,
  mu: number,
  rho: number,
): Readonly<{ value: number; dLambda: number; dMu: number; dRho: number }> {
  if (homeGoals === 0 && awayGoals === 0) {
    const value = 1 - lambda * mu * rho;
    return {
      value,
      dLambda: -mu * rho,
      dMu: -lambda * rho,
      dRho: -lambda * mu,
    };
  }
  if (homeGoals === 0 && awayGoals === 1) {
    return { value: 1 + lambda * rho, dLambda: rho, dMu: 0, dRho: lambda };
  }
  if (homeGoals === 1 && awayGoals === 0) {
    return { value: 1 + mu * rho, dLambda: 0, dMu: rho, dRho: mu };
  }
  if (homeGoals === 1 && awayGoals === 1) {
    return { value: 1 - rho, dLambda: 0, dMu: 0, dRho: -1 };
  }
  return { value: 1, dLambda: 0, dMu: 0, dRho: 0 };
}

function logFactorial(value: number): number {
  let total = 0;
  for (let index = 2; index <= value; index += 1) total += Math.log(index);
  return total;
}

/** Days between two `YYYY-MM-DD` dates, positive when `later` is later. */
function dayGap(earlier: string, later: string): number {
  return (Date.parse(later) - Date.parse(earlier)) / 86_400_000;
}

export type LeakageViolation = Readonly<{
  homeTeamKey: string;
  awayTeamKey: string;
  kickoffDate: string;
}>;

/**
 * Every training match that is not strictly before the cutoff.
 *
 * Called by `fitDixonColes` before it does anything else and treated as a
 * programming error rather than a data condition. A fit that silently drops
 * post-cutoff matches would still produce a plausible-looking model, and the
 * backtest built on it would report a validation score that had seen the
 * future. Refusing is the only safe behaviour.
 */
export function leakageViolations(
  matches: readonly TrainingMatch[],
  trainingCutoff: string,
): readonly LeakageViolation[] {
  const cutoff = Date.parse(trainingCutoff);
  return matches
    .filter((match) => Date.parse(match.kickoffDate) >= cutoff)
    .map((match) => ({
      homeTeamKey: match.homeTeamKey,
      awayTeamKey: match.awayTeamKey,
      kickoffDate: match.kickoffDate,
    }));
}

type Indexed = Readonly<{
  competition: number;
  home: number;
  away: number;
  homeGoals: number;
  awayGoals: number;
  weight: number;
  logFactorials: number;
}>;

export function fitDixonColes(
  input: Readonly<{
    matches: readonly TrainingMatch[];
    /** Exclusive. No match on or after this date may be in `matches`. */
    trainingCutoff: string;
    hyperparameters?: Partial<Hyperparameters>;
  }>,
): FittedModel {
  const hyperparameters: Hyperparameters = {
    ...DEFAULT_HYPERPARAMETERS,
    ...input.hyperparameters,
  };
  const violations = leakageViolations(input.matches, input.trainingCutoff);
  if (violations.length > 0)
    throw new Error(
      `TRAINING_DATA_AFTER_CUTOFF:${violations.length}:${violations[0]!.kickoffDate}`,
    );

  const teamIndex = new Map<string, number>();
  const teamKeys: string[] = [];
  const teamCompetition: string[] = [];
  const competitionIndex = new Map<string, number>();
  const competitionCodes: string[] = [];
  const indexed: Indexed[] = [];
  const teamWeight: number[] = [];
  const teamMatches: number[] = [];
  const competitionMatches: number[] = [];
  let goalsTotal = 0;
  let homeGoalsTotal = 0;
  let awayGoalsTotal = 0;

  /*
   * Team identity is scoped by competition. A club that plays in two of the
   * competitions in the corpus gets two rating pairs, because its attack
   * rating is only meaningful relative to the other teams in the same scoring
   * environment — that is the same reason cross-competition inference is not
   * offered.
   */
  const teamOf = (competitionCode: string, teamKey: string) => {
    const composite = `${competitionCode}|${teamKey}`;
    const existing = teamIndex.get(composite);
    if (existing !== undefined) return existing;
    const next = teamKeys.length;
    teamIndex.set(composite, next);
    teamKeys.push(teamKey);
    teamCompetition.push(competitionCode);
    teamWeight.push(0);
    teamMatches.push(0);
    return next;
  };
  const competitionOf = (competitionCode: string) => {
    const existing = competitionIndex.get(competitionCode);
    if (existing !== undefined) return existing;
    const next = competitionCodes.length;
    competitionIndex.set(competitionCode, next);
    competitionCodes.push(competitionCode);
    competitionMatches.push(0);
    return next;
  };

  for (const match of input.matches) {
    const competition = competitionOf(match.competitionCode);
    const home = teamOf(match.competitionCode, match.homeTeamKey);
    const away = teamOf(match.competitionCode, match.awayTeamKey);
    const age = dayGap(match.kickoffDate, input.trainingCutoff);
    const weight = Math.exp(
      -hyperparameters.timeDecayPerDay * Math.max(0, age),
    );
    indexed.push({
      competition,
      home,
      away,
      homeGoals: match.homeGoals,
      awayGoals: match.awayGoals,
      weight,
      logFactorials:
        logFactorial(match.homeGoals) + logFactorial(match.awayGoals),
    });
    teamWeight[home] = (teamWeight[home] ?? 0) + weight;
    teamWeight[away] = (teamWeight[away] ?? 0) + weight;
    teamMatches[home] = (teamMatches[home] ?? 0) + 1;
    teamMatches[away] = (teamMatches[away] ?? 0) + 1;
    competitionMatches[competition] =
      (competitionMatches[competition] ?? 0) + 1;
    goalsTotal += match.homeGoals + match.awayGoals;
    homeGoalsTotal += match.homeGoals;
    awayGoalsTotal += match.awayGoals;
  }

  const teamCount = teamKeys.length;
  const competitionCount = competitionCodes.length;
  if (indexed.length === 0 || teamCount === 0)
    return {
      teams: [],
      competitions: [],
      rho: 0,
      hyperparameters,
      trainingCutoff: input.trainingCutoff,
      iterations: 0,
      logLikelihood: 0,
      converged: false,
      matchesUsed: 0,
    };

  /*
   * Team membership per competition, built once. The re-centring step below
   * runs on every iteration of every walk-forward window, and scanning all
   * ~400 teams for each of the eleven competitions each time made it the
   * single most expensive part of a fit for no reason.
   */
  const teamsByCompetition: number[][] = Array.from(
    { length: competitionCount },
    () => [],
  );
  for (let team = 0; team < teamCount; team += 1) {
    const competition = competitionIndex.get(teamCompetition[team] ?? "");
    if (competition !== undefined) teamsByCompetition[competition]?.push(team);
  }

  const attack = new Float64Array(teamCount);
  const defence = new Float64Array(teamCount);
  const base = new Float64Array(competitionCount);
  const homeAdvantage = new Float64Array(competitionCount);
  const meanGoalsPerTeam = goalsTotal / (2 * indexed.length);
  base.fill(Math.log(Math.max(0.2, meanGoalsPerTeam)));
  /*
   * Home advantage starts at the corpus-wide log ratio of home to away goals
   * rather than at zero. It is the one parameter with a known sign and a known
   * rough magnitude, and starting it there costs nothing and removes a long
   * plateau at the beginning of the fit.
   */
  const initialHome = Math.log(
    Math.max(0.5, homeGoalsTotal) / Math.max(0.5, awayGoalsTotal),
  );
  homeAdvantage.fill(initialHome);
  let rho = 0;

  const parameterCount = teamCount * 2 + competitionCount * 2 + 1;
  const moment1 = new Float64Array(parameterCount);
  const moment2 = new Float64Array(parameterCount);
  const gradient = new Float64Array(parameterCount);
  const ATTACK = 0;
  const DEFENCE = teamCount;
  const BASE = teamCount * 2;
  const HOME = teamCount * 2 + competitionCount;
  const RHO = parameterCount - 1;

  const beta1 = 0.9;
  const beta2 = 0.999;
  const epsilon = 1e-8;
  let previousObjective = Number.NEGATIVE_INFINITY;
  let iterations = 0;
  let converged = false;
  let objective = Number.NEGATIVE_INFINITY;

  for (let step = 1; step <= hyperparameters.maxIterations; step += 1) {
    gradient.fill(0);
    let logLikelihood = 0;

    for (const match of indexed) {
      const competition = match.competition;
      const logLambda =
        (base[competition] ?? 0) +
        (attack[match.home] ?? 0) -
        (defence[match.away] ?? 0) +
        (homeAdvantage[competition] ?? 0);
      const logMu =
        (base[competition] ?? 0) +
        (attack[match.away] ?? 0) -
        (defence[match.home] ?? 0);
      const lambda = Math.exp(logLambda);
      const mu = Math.exp(logMu);
      const correction = tau(match.homeGoals, match.awayGoals, lambda, mu, rho);
      const tauValue = Math.max(1e-12, correction.value);

      logLikelihood +=
        match.weight *
        (Math.log(tauValue) +
          match.homeGoals * logLambda -
          lambda +
          match.awayGoals * logMu -
          mu -
          match.logFactorials);

      // d(log-likelihood)/d(log λ) and d/d(log μ), chain rule already applied.
      const homeScore =
        match.weight *
        (match.homeGoals - lambda + (lambda * correction.dLambda) / tauValue);
      const awayScore =
        match.weight *
        (match.awayGoals - mu + (mu * correction.dMu) / tauValue);

      gradient[ATTACK + match.home] =
        (gradient[ATTACK + match.home] ?? 0) + homeScore;
      gradient[DEFENCE + match.away] =
        (gradient[DEFENCE + match.away] ?? 0) - homeScore;
      gradient[ATTACK + match.away] =
        (gradient[ATTACK + match.away] ?? 0) + awayScore;
      gradient[DEFENCE + match.home] =
        (gradient[DEFENCE + match.home] ?? 0) - awayScore;
      gradient[BASE + competition] =
        (gradient[BASE + competition] ?? 0) + homeScore + awayScore;
      gradient[HOME + competition] =
        (gradient[HOME + competition] ?? 0) + homeScore;
      gradient[RHO] =
        (gradient[RHO] ?? 0) + (match.weight * correction.dRho) / tauValue;
    }

    let penalty = 0;
    for (let team = 0; team < teamCount; team += 1) {
      const a = attack[team] ?? 0;
      const d = defence[team] ?? 0;
      penalty += hyperparameters.ratingPenalty * (a * a + d * d);
      gradient[ATTACK + team] =
        (gradient[ATTACK + team] ?? 0) - 2 * hyperparameters.ratingPenalty * a;
      gradient[DEFENCE + team] =
        (gradient[DEFENCE + team] ?? 0) - 2 * hyperparameters.ratingPenalty * d;
    }
    objective = logLikelihood - penalty;

    for (let index = 0; index < parameterCount; index += 1) {
      const g = gradient[index] ?? 0;
      const m1 = beta1 * (moment1[index] ?? 0) + (1 - beta1) * g;
      const m2 = beta2 * (moment2[index] ?? 0) + (1 - beta2) * g * g;
      moment1[index] = m1;
      moment2[index] = m2;
      const corrected1 = m1 / (1 - Math.pow(beta1, step));
      const corrected2 = m2 / (1 - Math.pow(beta2, step));
      // Ascent: the objective is a log-likelihood, not a loss.
      const update =
        (hyperparameters.learningRate * corrected1) /
        (Math.sqrt(corrected2) + epsilon);
      if (index < DEFENCE) attack[index] = (attack[index] ?? 0) + update;
      else if (index < BASE)
        defence[index - DEFENCE] = (defence[index - DEFENCE] ?? 0) + update;
      else if (index < HOME)
        base[index - BASE] = (base[index - BASE] ?? 0) + update;
      else if (index < RHO)
        homeAdvantage[index - HOME] =
          (homeAdvantage[index - HOME] ?? 0) + update;
      else rho = Math.min(MAX_RHO, Math.max(MIN_RHO, rho + update));
    }

    /*
     * Attack and defence are only identified up to a constant that the
     * competition's own baseline can absorb, so they are re-centred to mean
     * zero within each competition after every step. Without this the fit
     * wanders along that flat direction, the L2 penalty fights it, and the
     * ratings stop being comparable between competitions even in the loose
     * sense they are meant to be.
     */
    for (
      let competition = 0;
      competition < competitionCount;
      competition += 1
    ) {
      const members = teamsByCompetition[competition];
      if (members === undefined || members.length === 0) continue;
      let attackSum = 0;
      let defenceSum = 0;
      for (const team of members) {
        attackSum += attack[team] ?? 0;
        defenceSum += defence[team] ?? 0;
      }
      const attackMean = attackSum / members.length;
      const defenceMean = defenceSum / members.length;
      for (const team of members) {
        attack[team] = (attack[team] ?? 0) - attackMean;
        defence[team] = (defence[team] ?? 0) - defenceMean;
      }
      // Shifting attack up and defence down both raise every expected goal
      // count in the competition, so the baseline absorbs exactly that.
      base[competition] = (base[competition] ?? 0) + attackMean - defenceMean;
    }

    iterations = step;
    if (
      Number.isFinite(previousObjective) &&
      Math.abs(objective - previousObjective) <=
        hyperparameters.tolerance * Math.max(1, Math.abs(objective))
    ) {
      converged = true;
      break;
    }
    previousObjective = objective;
  }

  return {
    teams: teamKeys.map((teamKey, index) => ({
      teamKey,
      competitionCode: teamCompetition[index] ?? "",
      attack: attack[index] ?? 0,
      defence: defence[index] ?? 0,
      sampleWeight: teamWeight[index] ?? 0,
      matches: teamMatches[index] ?? 0,
    })),
    competitions: competitionCodes.map((competitionCode, index) => ({
      competitionCode,
      base: base[index] ?? 0,
      homeAdvantage: homeAdvantage[index] ?? 0,
      matches: competitionMatches[index] ?? 0,
    })),
    rho,
    hyperparameters,
    trainingCutoff: input.trainingCutoff,
    iterations,
    logLikelihood: objective,
    converged,
    matchesUsed: indexed.length,
  };
}
