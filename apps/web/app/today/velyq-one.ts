import { calculateValue, type ValueMetrics } from "@velyq/analytics";
import { DEFAULT_DECISION_POLICY } from "@velyq/analytics/decision-engine";
import { LIVE_DATA_LABEL, type CustomerMatchDto } from "@velyq/contracts";
import { compareDecimalStrings, type DecimalString } from "@velyq/decimal";

export type VelyqOneSelection = Readonly<{
  match: CustomerMatchDto;
  metrics: ValueMetrics;
}>;

export function selectVelyqOne(
  matches: readonly CustomerMatchDto[],
  asOf: string,
): VelyqOneSelection | null {
  const asOfTime = Date.parse(asOf);
  if (!Number.isFinite(asOfTime)) return null;
  const utcDay = asOf.slice(0, 10);
  const minimumEdge = String(
    DEFAULT_DECISION_POLICY.minimumEdge,
  ) as DecimalString;
  const minimumExpectedValue = String(
    DEFAULT_DECISION_POLICY.minimumExpectedValue,
  ) as DecimalString;
  const eligible: VelyqOneSelection[] = [];

  for (const match of matches) {
    const kickoffTime = Date.parse(match.startsAt);
    if (
      match.recommendation !== "STRONG_EDGE" ||
      match.syntheticLabel !== LIVE_DATA_LABEL ||
      match.freshness !== "CURRENT" ||
      match.lineup !== "OFFICIAL" ||
      (match.quality.grade !== "A" && match.quality.grade !== "B") ||
      match.priceValidity.status !== "ATTRACTIVE" ||
      !Number.isFinite(kickoffTime) ||
      kickoffTime <= asOfTime ||
      match.startsAt.slice(0, 10) !== utcDay ||
      match.modelProbability === null ||
      match.currentOdds === null ||
      match.priceValidity.minimumAcceptableOdds === null
    ) {
      continue;
    }

    const currentValue = calculateValue(
      match.modelProbability,
      match.currentOdds,
    );
    if (!currentValue.ok) continue;

    const edge = compareDecimalStrings(
      currentValue.value.probabilityEdge,
      minimumEdge,
    );
    const expectedValue = compareDecimalStrings(
      currentValue.value.expectedValue,
      minimumExpectedValue,
    );
    const price = compareDecimalStrings(
      match.currentOdds,
      match.priceValidity.minimumAcceptableOdds,
    );
    if (
      !edge.ok ||
      edge.value < 0 ||
      !expectedValue.ok ||
      expectedValue.value < 0 ||
      !price.ok ||
      price.value < 0
    ) {
      continue;
    }

    eligible.push(Object.freeze({ match, metrics: currentValue.value }));
  }

  eligible.sort(compareSelections);
  return eligible[0] ?? null;
}

function compareSelections(a: VelyqOneSelection, b: VelyqOneSelection) {
  const byEdge = descendingDecimal(
    a.metrics.probabilityEdge,
    b.metrics.probabilityEdge,
  );
  if (byEdge !== 0) return byEdge;

  const byExpectedValue = descendingDecimal(
    a.metrics.expectedValue,
    b.metrics.expectedValue,
  );
  if (byExpectedValue !== 0) return byExpectedValue;

  const byQuality = a.match.quality.grade.localeCompare(b.match.quality.grade);
  if (byQuality !== 0) return byQuality;

  const byKickoff = a.match.startsAt.localeCompare(b.match.startsAt);
  if (byKickoff !== 0) return byKickoff;

  const byEvent = a.match.eventId.localeCompare(b.match.eventId);
  if (byEvent !== 0) return byEvent;
  return a.match.selection.localeCompare(b.match.selection);
}

function descendingDecimal(left: DecimalString, right: DecimalString) {
  const comparison = compareDecimalStrings(left, right);
  return comparison.ok ? -comparison.value : 0;
}
