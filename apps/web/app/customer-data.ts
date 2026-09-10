import { CustomerQueryService } from "@velyq/application";
import { evaluatePriceValidity } from "@velyq/analytics/price-validity";
import type { CustomerMatchDto, CustomerTodayDto } from "@velyq/contracts";
import type { DecimalString } from "@velyq/decimal";
import { offsetHours, resolveDemoClock } from "./demo-clock";
import { summariseTodayAggregate } from "./customer-today-aggregate";

const d = (value: string) => value as DecimalString;

/*
 * Kickoff and feature-cutoff times as an offset in hours from the snapshot
 * (`asOf`), not an absolute date. This is what makes "today" actually mean
 * today: the fixtures used to hardcode 2026-09-04, so a visitor on any later
 * date saw a "Snapshot as of 10:00 UTC" and kickoffs that were all already in
 * the past. Every other field — odds, probabilities, EV, edge, quality,
 * trace identity — is untouched by this and stays pinned exactly as before.
 */
function matchTemplates(): ReadonlyArray<
  Omit<
    CustomerMatchDto,
    | "startsAt"
    | "trace"
    | "movementState"
    | "observationTimes"
    | "priceValidity"
  > & {
    startsAtOffsetHours: number;
    trace: Omit<CustomerMatchDto["trace"], "featureCutoff">;
  }
> {
  return [
    {
      eventId: "76000000-0000-4000-8000-000000000001",
      homeTeam: "Northbridge United",
      awayTeam: "Riverside Athletic",
      competition: "Premier Synthetic League",
      startsAtOffsetHours: 8.5,
      syntheticLabel: "Synthetic data",
      scenario: {
        id: "74000000-0000-4000-8000-000000000004",
        state: "STRONG_EDGE",
        label: "Strong edge",
      },
      freshness: "CURRENT",
      selection: "HOME",
      recommendation: "STRONG_EDGE",
      modelProbability: d("0.6"),
      impliedProbability: d("0.540540540541"),
      fairOdds: d("1.666666666666666666666666666667"),
      currentOdds: d("1.85"),
      openingOdds: d("2.1"),
      movementPercent: d("-0.11904761904762"),
      probabilityEdge: d("0.059459459459"),
      expectedValue: d("0.11"),
      lineup: "OFFICIAL",
      quality: {
        grade: "A",
        score: d("1"),
        policyVersion: "phase-1-quality.v1",
        reasonCodes: [],
      },
      trace: {
        modelVersion: "phase-1-experimental.v1",
        maturity: "EXPERIMENTAL",
        calibrationVersion: "identity.v1",
        scoreVersion: "edge.v1",
        sourceObservationIds: ["72000000-0000-4000-8000-000000000001"],
      },
      /*
       * A genuine second market on the flagship fixture, deliberately NOT
       * showing the same verdict as the 1X2 headline above -- the model
       * disagreeing with itself across markets is normal, not a defect, and
       * a demo that always agreed with its own headline would misrepresent
       * how the real pipeline behaves.
       */
      secondaryMarkets: [
        {
          marketCode: "FOOTBALL_FULL_TIME_TOTAL",
          marketLabelKey: "market.football_full_time_total",
          lineValue: "2.5",
          selection: "OVER",
          recommendation: "WAIT",
          modelProbability: d("0.58"),
          currentOdds: d("1.98"),
          fairOdds: d("1.724137931034482758620689655172"),
          probabilityEdge: d("0.02"),
          expectedValue: d("0.148"),
          freshness: "CURRENT",
        },
        {
          marketCode: "FOOTBALL_FULL_TIME_TOTAL",
          marketLabelKey: "market.football_full_time_total",
          lineValue: "2.5",
          selection: "UNDER",
          recommendation: "NO_BET",
          modelProbability: d("0.42"),
          currentOdds: d("1.87"),
          fairOdds: d("2.380952380952380952380952380952"),
          probabilityEdge: d("-0.02"),
          expectedValue: d("-0.214"),
          freshness: "CURRENT",
        },
      ],
    },
    {
      eventId: "76000000-0000-4000-8000-000000000002",
      homeTeam: "Eastvale City",
      awayTeam: "Kingsport FC",
      competition: "Premier Synthetic League",
      startsAtOffsetHours: 10,
      syntheticLabel: "Synthetic data",
      scenario: {
        id: "74000000-0000-4000-8000-000000000014",
        state: "WAIT_FOR_LINEUP",
        label: "Wait for lineup",
      },
      freshness: "CURRENT",
      selection: "HOME",
      recommendation: "WAIT_FOR_LINEUP",
      modelProbability: null,
      impliedProbability: d("0.476190476190"),
      fairOdds: null,
      currentOdds: d("2.1"),
      openingOdds: d("2.2"),
      movementPercent: d("-0.04545454545455"),
      probabilityEdge: null,
      expectedValue: null,
      lineup: "MISSING",
      quality: {
        grade: "B",
        score: d("0.75"),
        policyVersion: "phase-1-quality.v1",
        reasonCodes: ["MISSING_LINEUP"],
      },
      trace: {
        modelVersion: "phase-1-experimental.v1",
        maturity: "EXPERIMENTAL",
        calibrationVersion: "identity.v1",
        scoreVersion: "edge.v1",
        sourceObservationIds: ["72000000-0000-4000-8000-000000000011"],
      },
      /*
       * The headline market is gated on a missing lineup, but the totals
       * market is already fully priced and clears the policy -- a real,
       * honest illustration that a fixture blocked on one market can still
       * have an actionable decision on another.
       */
      secondaryMarkets: [
        {
          marketCode: "FOOTBALL_FULL_TIME_TOTAL",
          marketLabelKey: "market.football_full_time_total",
          lineValue: "2.5",
          selection: "OVER",
          recommendation: "STRONG_EDGE",
          modelProbability: d("0.64"),
          currentOdds: d("1.80"),
          fairOdds: d("1.5625"),
          probabilityEdge: d("0.084"),
          expectedValue: d("0.152"),
          freshness: "CURRENT",
        },
      ],
    },
    {
      eventId: "76000000-0000-4000-8000-000000000003",
      homeTeam: "Harbor Rovers",
      awayTeam: "Oldtown FC",
      competition: "Premier Synthetic League",
      startsAtOffsetHours: 11.5,
      syntheticLabel: "Synthetic data",
      scenario: {
        id: "74000000-0000-4000-8000-000000000005",
        state: "NO_BET",
        label: "No bet",
      },
      freshness: "STALE",
      selection: "DRAW",
      recommendation: "NO_BET",
      modelProbability: null,
      impliedProbability: null,
      fairOdds: null,
      currentOdds: null,
      openingOdds: null,
      movementPercent: null,
      probabilityEdge: null,
      expectedValue: null,
      lineup: "EXPECTED",
      quality: {
        grade: "F",
        score: d("0"),
        policyVersion: "phase-1-quality.v1",
        reasonCodes: ["STALE_DATA", "MISSING_PRICE"],
      },
      trace: {
        modelVersion: "phase-1-experimental.v1",
        maturity: "EXPERIMENTAL",
        calibrationVersion: "identity.v1",
        scoreVersion: "edge.v1",
        sourceObservationIds: ["71000000-0000-4000-8000-000000000002"],
      },
    },
    {
      eventId: "76000000-0000-4000-8000-000000000004",
      homeTeam: "Lakeside Albion",
      awayTeam: "Metro Vale",
      competition: "Premier Synthetic League",
      startsAtOffsetHours: 12,
      syntheticLabel: "Synthetic data",
      scenario: {
        id: "74000000-0000-4000-8000-000000000002",
        state: "EXPECTED_LINEUP",
        label: "Expected lineup",
      },
      freshness: "CURRENT",
      selection: "AWAY",
      recommendation: "WAIT",
      modelProbability: d("0.45"),
      impliedProbability: d("0.5"),
      fairOdds: d("2.222222222222222222222222222222"),
      currentOdds: d("2"),
      openingOdds: d("1.9"),
      movementPercent: d("0.05263157894737"),
      probabilityEdge: d("-0.05"),
      expectedValue: d("-0.1"),
      lineup: "EXPECTED",
      quality: {
        grade: "B",
        score: d("0.75"),
        policyVersion: "phase-1-quality.v1",
        reasonCodes: ["WAITING_FOR_CONFIRMATION"],
      },
      trace: {
        modelVersion: "phase-1-experimental.v1",
        maturity: "EXPERIMENTAL",
        calibrationVersion: "identity.v1",
        scoreVersion: "edge.v1",
        sourceObservationIds: ["73000000-0000-4000-8000-000000000001"],
      },
    },
    {
      eventId: "76000000-0000-4000-8000-000000000005",
      homeTeam: "Southport Vale",
      awayTeam: "Cedar Athletic",
      competition: "Premier Synthetic League",
      startsAtOffsetHours: 32.5,
      syntheticLabel: "Synthetic data",
      scenario: {
        id: "74000000-0000-4000-8000-000000000031",
        state: "EDGE_DISAPPEARED",
        label: "Edge disappeared",
      },
      freshness: "CURRENT",
      selection: "HOME",
      recommendation: "EDGE_DISAPPEARED",
      modelProbability: d("0.5"),
      impliedProbability: d("0.5"),
      fairOdds: d("2"),
      currentOdds: d("2"),
      openingOdds: d("1.75"),
      movementPercent: d("0.14285714285714"),
      probabilityEdge: d("0"),
      expectedValue: d("0"),
      lineup: "OFFICIAL",
      quality: {
        grade: "A",
        score: d("1"),
        policyVersion: "phase-1-quality.v1",
        reasonCodes: ["EDGE_DISAPPEARED", "REPRICED"],
      },
      trace: {
        modelVersion: "phase-1-experimental.v1",
        maturity: "EXPERIMENTAL",
        calibrationVersion: "identity.v1",
        scoreVersion: "edge.v1",
        sourceObservationIds: ["72000000-0000-4000-8000-000000000021"],
      },
    },
    {
      eventId: "76000000-0000-4000-8000-000000000006",
      homeTeam: "Westhaven FC",
      awayTeam: "Union Park",
      competition: "Premier Synthetic League",
      startsAtOffsetHours: 34,
      syntheticLabel: "Synthetic data",
      scenario: {
        id: "74000000-0000-4000-8000-000000000023",
        state: "INSUFFICIENT_DATA",
        label: "Insufficient data",
      },
      freshness: "CURRENT",
      selection: "Over 2.5",
      recommendation: "INSUFFICIENT_DATA",
      modelProbability: null,
      impliedProbability: null,
      fairOdds: null,
      currentOdds: null,
      openingOdds: null,
      movementPercent: null,
      probabilityEdge: null,
      expectedValue: null,
      lineup: "EXPECTED",
      quality: {
        grade: "F",
        score: d("0"),
        policyVersion: "phase-1-quality.v1",
        reasonCodes: ["MISSING_PRICE", "INSUFFICIENT_COVERAGE"],
      },
      trace: {
        modelVersion: "phase-1-experimental.v1",
        maturity: "EXPERIMENTAL",
        calibrationVersion: "identity.v1",
        scoreVersion: "edge.v1",
        sourceObservationIds: [
          "73000000-0000-4000-8000-000000000011",
          "73000000-0000-4000-8000-000000000012",
        ],
      },
    },
    {
      eventId: "76000000-0000-4000-8000-000000000007",
      homeTeam: "Pinecrest Town",
      awayTeam: "Beacon Rovers",
      competition: "Premier Synthetic League",
      startsAtOffsetHours: 35.5,
      syntheticLabel: "Synthetic data",
      scenario: {
        id: "74000000-0000-4000-8000-000000000021",
        state: "CHANGED_LINEUP",
        label: "Changed lineup",
      },
      freshness: "CURRENT",
      selection: "DRAW",
      recommendation: "NO_BET",
      modelProbability: d("0.31"),
      impliedProbability: d("0.3"),
      fairOdds: d("3.225806451612903225806451612903"),
      currentOdds: d("3.33"),
      openingOdds: d("3.2"),
      movementPercent: d("0.040625"),
      probabilityEdge: d("0.01"),
      expectedValue: d("0.0323"),
      lineup: "CHANGED",
      quality: {
        grade: "C",
        score: d("0.5"),
        policyVersion: "phase-1-quality.v1",
        reasonCodes: ["LOW_MAPPING_CONFIDENCE"],
      },
      trace: {
        modelVersion: "phase-1-experimental.v1",
        maturity: "EXPERIMENTAL",
        calibrationVersion: "identity.v1",
        scoreVersion: "edge.v1",
        sourceObservationIds: ["73000000-0000-4000-8000-000000000011"],
      },
    },
  ];
}

/**
 * Builds the synthetic "Today" snapshot as of `now`. Kickoffs and the
 * feature cutoff are `now` plus the fixed offsets above, so the demo's
 * "today" always tracks whatever day it is actually viewed on; every other
 * field is identical no matter what `now` is.
 */
/**
 * The same authoritative assessment the live path uses.
 *
 * Imported rather than reimplemented so the demo corpus cannot drift into
 * quoting a watch threshold the decision engine would not endorse -- which
 * is exactly the defect this replaced on the customer surfaces.
 */
function priceValidityFor(
  match: Readonly<{
    modelProbability: string | null;
    currentOdds: string | null;
  }>,
): CustomerMatchDto["priceValidity"] {
  const assessment = evaluatePriceValidity({
    modelProbability: match.modelProbability,
    currentOdds: match.currentOdds,
  });
  return {
    status: assessment.status,
    policyVersion: assessment.policyVersion,
    breakEvenOdds: assessment.breakEvenOdds,
    minimumAcceptableOdds: assessment.minimumAcceptableOdds,
  };
}

export function buildCustomerTodayData(now: Date): CustomerTodayDto {
  const asOf = now.toISOString();
  const matches = matchTemplates().map(
    ({ startsAtOffsetHours, trace, ...match }) => ({
      ...match,
      startsAt: offsetHours(now, startsAtOffsetHours),
      /*
       * Derived here rather than restated in every template, and derived
       * the same way the live mapper derives them -- a demo corpus whose
       * movement or price-validity semantics differed from production
       * would be a fixture that cannot catch a production defect.
       */
      movementState:
        match.movementPercent === null
          ? ("INSUFFICIENT_HISTORY" as const)
          : Number(match.movementPercent) === 0
            ? ("UNCHANGED" as const)
            : ("MOVED" as const),
      /*
       * Evidence depth, kept consistent with the state above: a movement
       * figure requires at least two distinct observation instants, and
       * INSUFFICIENT_HISTORY means exactly one was ever seen.
       */
      observationTimes: match.movementPercent === null ? 1 : 2,
      priceValidity: priceValidityFor(match),
      trace: { ...trace, featureCutoff: asOf },
    }),
  );
  return {
    syntheticLabel: "Synthetic data",
    asOf,
    matches,
    summary: summariseTodayAggregate(matches),
  };
}

/**
 * The synthetic snapshot, built per call rather than once at module scope.
 *
 * This used to be a module-level `const` initialised with
 * `buildCustomerTodayData(resolveDemoClock())`, which is why the deployed
 * Worker rendered "Thursday, 01 January 1970" as its Today dateline. A
 * Cloudflare Worker evaluates module top-level code during isolate startup,
 * outside any request, where the clock is pinned rather than real -- so
 * `new Date()` there produced the Unix epoch, `asOf` became
 * "1970-01-01T00:00:00.000Z", and `formatLongDate` faithfully rendered it.
 * Every kickoff was then epoch-plus-an-offset too.
 *
 * Reading the clock inside a call means it is read during a request, when
 * the runtime has a real one. It is deliberately not memoised: the snapshot
 * is a handful of object spreads, and caching the first request's timestamp
 * for the isolate's lifetime is what "today" drifting stale looked like
 * before.
 */
export function customerTodaySnapshot(
  now: Date = resolveDemoClock(),
): CustomerTodayDto {
  return buildCustomerTodayData(now);
}

export const customerReadRepository = {
  getToday: () => customerTodaySnapshot(),
  getMatch: (eventId: string) =>
    customerTodaySnapshot().matches.find(
      (match) => match.eventId === eventId,
    ) ?? null,
};
export const customerQueries = new CustomerQueryService(customerReadRepository);
export function findCustomerMatch(
  eventId: string,
): CustomerMatchDto | undefined {
  return customerTodaySnapshot().matches.find(
    (match) => match.eventId === eventId,
  );
}
