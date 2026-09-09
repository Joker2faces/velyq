/**
 * One bucket per tracked match, so headline counts add up.
 *
 * Today's summary was built from four independent filters — actionable,
 * watch, blocked, forecastable — each scanning the full list. On the observed
 * production day they happened to sum to the tracked total, but nothing made
 * that true: a match with a forecast, a WAIT recommendation *and* a failing
 * quality grade satisfies both "watch" and "blocked", so the figures would
 * have quietly exceeded the number of matches they described.
 *
 * A customer reading "8 tracked / 1 watch / 7 blocked" is entitled to assume
 * those describe disjoint sets of the same eight fixtures. This makes that
 * assumption true by construction: every match lands in exactly one bucket,
 * and the buckets are exhaustive.
 */

export type CustomerMatchBucket = "ACTIONABLE" | "BLOCKED" | "WATCH" | "NO_BET";

export type SummarisableMatch = Readonly<{
  recommendation: string;
  modelProbability: string | null;
  quality: Readonly<{ grade: string }>;
}>;

/**
 * Which single bucket a match belongs to.
 *
 * Order is deliberate. A failing quality gate is reported ahead of a waiting
 * state because it is the more informative answer to "why is this not
 * actionable" — the gate is the reason, and the waiting state is a
 * consequence of it.
 */
export function classifyCustomerMatch(
  match: SummarisableMatch,
): CustomerMatchBucket {
  if (match.recommendation === "STRONG_EDGE" || match.recommendation === "EDGE")
    return "ACTIONABLE";
  if (
    match.quality.grade === "F" ||
    match.recommendation === "INSUFFICIENT_DATA"
  )
    return "BLOCKED";
  if (match.recommendation === "NO_BET") return "NO_BET";
  return "WATCH";
}

export type CustomerTodaySummary = Readonly<{
  tracked: number;
  actionable: number;
  blocked: number;
  watch: number;
  noBet: number;
  /**
   * Matches carrying a model probability.
   *
   * Deliberately *not* part of the partition: a forecast can exist in any
   * bucket, so this is reported separately rather than summed with the
   * others.
   */
  forecastable: number;
}>;

export function summariseCustomerMatches(
  matches: readonly SummarisableMatch[],
): CustomerTodaySummary {
  let actionable = 0;
  let blocked = 0;
  let watch = 0;
  let noBet = 0;
  let forecastable = 0;

  for (const match of matches) {
    switch (classifyCustomerMatch(match)) {
      case "ACTIONABLE":
        actionable += 1;
        break;
      case "BLOCKED":
        blocked += 1;
        break;
      case "NO_BET":
        noBet += 1;
        break;
      default:
        watch += 1;
    }
    if (match.modelProbability !== null) forecastable += 1;
  }

  return {
    tracked: matches.length,
    actionable,
    blocked,
    watch,
    noBet,
    forecastable,
  };
}
