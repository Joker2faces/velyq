import type {
  CustomerMatchDto,
  CustomerTodayAggregateDto,
  RecommendationStatus,
} from "@velyq/contracts";

/**
 * Real counts behind Today, computed from the same fixture list Today
 * already mapped -- never a second query, never the internal
 * funnel-diagnostic route's ops-only numbers.
 *
 * Deliberately its own module with zero database dependency: both the live
 * mapper (`customer-database.ts`) and the demo/fixture builder
 * (`customer-data.ts`) need the identical aggregate from the identical
 * `CustomerMatchDto[]` shape, and neither should have to pull in the other's
 * (much heavier) module just to get it.
 */
export function summariseTodayAggregate(
  matches: readonly CustomerMatchDto[],
): CustomerTodayAggregateDto {
  const byRecommendation: Record<RecommendationStatus, number> = {
    STRONG_EDGE: 0,
    NO_BET: 0,
    WAIT: 0,
    WAIT_FOR_LINEUP: 0,
    INSUFFICIENT_DATA: 0,
    EDGE_DISAPPEARED: 0,
  };
  let lineupGated = 0;
  for (const match of matches) {
    byRecommendation[match.recommendation] += 1;
    if (match.lineup === "MISSING" || match.recommendation === "WAIT_FOR_LINEUP") {
      lineupGated += 1;
    }
  }
  return {
    totalFixtures: matches.length,
    byRecommendation,
    lineupGated,
  };
}
