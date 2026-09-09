/**
 * How old a market observation may be before it stops being evidence of the
 * current market.
 *
 * Before this existed the pipeline had no age bound at all: the only validity
 * rule anywhere was `provider_observed_at <= asOf`, i.e. "not from the
 * future". A production audit found the newest price in the database was 27
 * hours old and still being treated as the live market, which makes every
 * derived number -- implied probability, edge, EV, price validity -- a
 * statement about yesterday presented as a statement about now.
 *
 * The thresholds are deliberately conservative and deliberately *not* tuned
 * to make EDGE appear. A policy chosen to produce output would be the same
 * defect wearing a threshold.
 */

/**
 * Bumped on any threshold change, and recorded alongside decisions so a past
 * verdict can be re-read against the rule that actually produced it.
 */
export const ODDS_FRESHNESS_POLICY_VERSION = "odds-freshness-policy-v1";

export type OddsFreshness = "CURRENT" | "AGING" | "STALE" | "UNAVAILABLE";

/**
 * Pre-match 1X2 prices move on team news, injury reports and money. Within
 * three quarters of an hour the market has usually not moved far enough for a
 * derived edge to be misleading, so an observation this recent is treated as
 * the current market.
 */
export const CURRENT_WITHIN_MINUTES = 45;

/**
 * Between 45 minutes and three hours an observation is still informative --
 * it is a real price, and it is the best available -- but it is no longer a
 * claim about the market right now. Decisions may see it; they must not
 * present it as current.
 *
 * Three hours is the point at which a typical pre-match line has had time to
 * absorb a full news cycle, so beyond it the observation describes a market
 * that no longer exists.
 */
export const AGING_WITHIN_MINUTES = 180;

export type OddsFreshnessAssessment = Readonly<{
  freshness: OddsFreshness;
  ageMinutes: number | null;
  policyVersion: string;
  /** Whether a decision engine may derive an actionable edge from this. */
  actionable: boolean;
}>;

/**
 * Classifies one observation's age.
 *
 * A future-dated observation is treated as `CURRENT` with a zero age rather
 * than as an error: small clock skew between the provider and us is normal,
 * and the pre-existing `provider_observed_at <= asOf` filter already excludes
 * anything meaningfully ahead of the read.
 */
export function assessOddsFreshness(
  observedAt: Date | null,
  asOf: Date,
): OddsFreshnessAssessment {
  if (observedAt === null) {
    return {
      freshness: "UNAVAILABLE",
      ageMinutes: null,
      policyVersion: ODDS_FRESHNESS_POLICY_VERSION,
      actionable: false,
    };
  }

  const ageMinutes = Math.max(
    0,
    (asOf.getTime() - observedAt.getTime()) / 60_000,
  );
  const freshness: OddsFreshness =
    ageMinutes <= CURRENT_WITHIN_MINUTES
      ? "CURRENT"
      : ageMinutes <= AGING_WITHIN_MINUTES
        ? "AGING"
        : "STALE";

  return {
    freshness,
    ageMinutes,
    policyVersion: ODDS_FRESHNESS_POLICY_VERSION,
    /*
     * Only a current price is actionable. `AGING` is deliberately excluded:
     * the product's whole claim is that a stated edge reflects the market a
     * customer can actually bet into, and an hour-old line does not support
     * that claim even though it is genuine data. It remains visible as
     * evidence and as movement history -- it simply cannot be the basis of
     * an EDGE.
     */
    actionable: freshness === "CURRENT",
  };
}

/**
 * How often a fixture's prices are worth re-requesting, as a function of how
 * close its kickoff is.
 *
 * A flat interval does not survive the budget. Refreshing every fixture as
 * soon as its price stops being `CURRENT` means one request per fixture per
 * 45 minutes, so two eligible fixtures alone would spend the whole daily odds
 * allocation -- and it would spend it chronologically, exhausting the budget
 * during the quiet morning and leaving the evening kickoffs unpriced, which
 * is precisely backwards.
 *
 * So the cadence tightens as the decision gets closer. Far out, a price is
 * mostly context and moves slowly. Inside the last hour it is the thing the
 * customer would actually bet into, and it moves on team news.
 */
const REFRESH_CADENCE_MINUTES: readonly Readonly<{
  withinHoursToKickoff: number;
  everyMinutes: number;
}>[] = [
  { withinHoursToKickoff: 0.75, everyMinutes: 15 },
  { withinHoursToKickoff: 3, everyMinutes: 30 },
  { withinHoursToKickoff: 12, everyMinutes: 120 },
  { withinHoursToKickoff: Number.POSITIVE_INFINITY, everyMinutes: 360 },
];

export function oddsRefreshIntervalMinutes(
  kickoffAt: Date,
  asOf: Date,
): number {
  const hoursToKickoff = (kickoffAt.getTime() - asOf.getTime()) / 3_600_000;
  const band = REFRESH_CADENCE_MINUTES.find(
    (entry) => hoursToKickoff <= entry.withinHoursToKickoff,
  );
  return band?.everyMinutes ?? 360;
}

/**
 * Whether a fixture's prices are worth re-requesting.
 *
 * Two conditions, and both must hold: the price must no longer be actionable
 * (the same boundary the decision engine uses, so the pipeline never settles
 * into refreshing prices it would refuse to act on, or acting on prices it
 * never refreshes), *and* enough time must have passed for another request to
 * be worth its share of a finite daily budget.
 *
 * A fixture that has already kicked off is not refreshed: its closing price
 * is whatever was last observed, and spending a request to watch an in-play
 * market the product does not price would take budget from a fixture that
 * still has a decision left in it.
 */
export function oddsRefreshDue(
  latestObservedAt: Date | null,
  asOf: Date,
  kickoffAt?: Date,
): boolean {
  if (kickoffAt && kickoffAt.getTime() <= asOf.getTime()) return false;

  const assessment = assessOddsFreshness(latestObservedAt, asOf);
  if (assessment.actionable) return false;
  /* Never priced at all: always worth the first request. */
  if (assessment.ageMinutes === null) return true;
  if (!kickoffAt) return true;

  return assessment.ageMinutes >= oddsRefreshIntervalMinutes(kickoffAt, asOf);
}
