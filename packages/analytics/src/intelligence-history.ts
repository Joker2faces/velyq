import type { DecimalString } from "@velyq/decimal";
import { closingLineValue } from "./performance.js";

export type PricePoint = Readonly<{
  id: string;
  outcomeId: string;
  bookmakerId: string;
  odds: DecimalString;
  observedAt: string;
  status: "ACTIVE" | "SUSPENDED" | "REMOVED";
}>;
export type ClosingPrice = Readonly<{
  odds: DecimalString;
  observationIds: readonly string[];
  bookmakerCount: number;
  observedAt: string;
}>;

/**
 * Closing price policy v1: same outcome only; ACTIVE prices at/before kickoff;
 * retain each bookmaker's last observation; discard books older than 60m from
 * the freshest eligible observation; return the median consensus, not an
 * arbitrary provider row. Even-sized samples use the mean of the middle pair.
 */
export function selectClosingPrice(
  input: Readonly<{
    outcomeId: string;
    kickoff: string;
    observations: readonly PricePoint[];
  }>,
): ClosingPrice | null {
  const kickoff = Date.parse(input.kickoff);
  const eligible = input.observations.filter(
    (point) =>
      point.outcomeId === input.outcomeId &&
      point.status === "ACTIVE" &&
      Number.isFinite(Date.parse(point.observedAt)) &&
      Date.parse(point.observedAt) <= kickoff &&
      Number(point.odds) > 1,
  );
  const latest = new Map<string, PricePoint>();
  for (const point of eligible)
    if (
      !latest.has(point.bookmakerId) ||
      Date.parse(point.observedAt) >
        Date.parse(latest.get(point.bookmakerId)!.observedAt)
    )
      latest.set(point.bookmakerId, point);
  const freshest = Math.max(
    ...[...latest.values()].map((point) => Date.parse(point.observedAt)),
  );
  if (!Number.isFinite(freshest)) return null;
  const valid = [...latest.values()]
    .filter(
      (point) => freshest - Date.parse(point.observedAt) <= 60 * 60 * 1000,
    )
    .sort((a, b) => Number(a.odds) - Number(b.odds));
  if (valid.length === 0) return null;
  const middle = Math.floor(valid.length / 2);
  const median =
    valid.length % 2
      ? Number(valid[middle]!.odds)
      : (Number(valid[middle - 1]!.odds) + Number(valid[middle]!.odds)) / 2;
  return {
    odds: String(median) as DecimalString,
    observationIds: valid.map((point) => point.id),
    bookmakerCount: valid.length,
    observedAt: new Date(freshest).toISOString(),
  };
}

export function eligibleClv(
  input: Readonly<{
    decisionOutcomeId: string;
    decisionOdds: DecimalString | null;
    decisionAt: string;
    kickoff: string;
    closing: ClosingPrice | null;
    closingOutcomeId: string;
  }>,
): DecimalString | null {
  if (
    !input.decisionOdds ||
    !input.closing ||
    input.decisionOutcomeId !== input.closingOutcomeId ||
    Date.parse(input.decisionAt) >= Date.parse(input.kickoff) ||
    Date.parse(input.closing.observedAt) > Date.parse(input.kickoff)
  )
    return null;
  return closingLineValue(input.decisionOdds, input.closing.odds);
}

export type Snapshot = Readonly<{
  at: string;
  price: string | null;
  modelProbability: string | null;
  lineup: string;
  quality: string;
  decision: string;
  edge: string | null;
  market: string;
}>;
export type ChangeKind =
  | "PRICE_CHANGED"
  | "MODEL_CHANGED"
  | "LINEUP_CHANGED"
  | "QUALITY_CHANGED"
  | "DECISION_CHANGED"
  | "EDGE_CHANGED"
  | "MARKET_CHANGED";
export function diffSnapshots(before: Snapshot, after: Snapshot) {
  const fields = [
    ["price", "PRICE_CHANGED"],
    ["modelProbability", "MODEL_CHANGED"],
    ["lineup", "LINEUP_CHANGED"],
    ["quality", "QUALITY_CHANGED"],
    ["decision", "DECISION_CHANGED"],
    ["edge", "EDGE_CHANGED"],
    ["market", "MARKET_CHANGED"],
  ] as const;
  return fields
    .filter(([field]) => before[field] !== after[field])
    .map(([field, kind]) => ({
      kind: kind as ChangeKind,
      before: before[field],
      after: after[field],
      at: after.at,
    }));
}

export type TimelineEvent = Readonly<{
  type: string;
  at: string;
  sourceId: string;
}>;
export function chronologicalTimeline(
  events: readonly TimelineEvent[],
): readonly TimelineEvent[] {
  return [...events].sort(
    (a, b) =>
      Date.parse(a.at) - Date.parse(b.at) ||
      a.sourceId.localeCompare(b.sourceId),
  );
}

export function edgePersistence(
  observations: readonly Readonly<{ at: string; active: boolean }>[],
  asOf: string,
) {
  const ordered = [...observations].sort(
    (a, b) => Date.parse(a.at) - Date.parse(b.at),
  );
  const firstIndex = ordered.findIndex((item) => item.active);
  if (firstIndex < 0)
    return {
      state: "ENDED" as const,
      firstAppeared: null,
      durationMs: 0,
      observationCount: ordered.length,
      thresholdCrossings: 0,
    };
  let crossings = 0;
  for (let index = 1; index < ordered.length; index += 1)
    if (ordered[index]!.active !== ordered[index - 1]!.active) crossings += 1;
  const active = ordered.at(-1)!.active;
  const end = active
    ? Date.parse(asOf)
    : Date.parse(
        ordered.find((item, index) => index > firstIndex && !item.active)?.at ??
          ordered.at(-1)!.at,
      );
  return {
    state:
      crossings > 2
        ? ("UNSTABLE" as const)
        : active
          ? ("ACTIVE" as const)
          : ("ENDED" as const),
    firstAppeared: ordered[firstIndex]!.at,
    durationMs: Math.max(0, end - Date.parse(ordered[firstIndex]!.at)),
    observationCount: ordered.length,
    thresholdCrossings: crossings,
  };
}

export function trackRecord(
  rows: readonly Readonly<{
    settlement: "WIN" | "LOSS" | "VOID" | "UNSETTLED";
    odds: string | null;
    clv: string | null;
  }>[],
) {
  const settled = rows.filter((row) => row.settlement !== "UNSETTLED");
  const decided = settled.filter(
    (row) => row.settlement === "WIN" || row.settlement === "LOSS",
  );
  const wins = decided.filter((row) => row.settlement === "WIN").length;
  const odds = settled.flatMap((row) => (row.odds ? [Number(row.odds)] : []));
  const clv = settled.flatMap((row) => (row.clv ? [Number(row.clv)] : []));
  return {
    sampleSize: settled.length,
    wins,
    losses: decided.length - wins,
    voids: settled.filter((row) => row.settlement === "VOID").length,
    hitRate: decided.length ? wins / decided.length : null,
    averageDecisionOdds: odds.length
      ? odds.reduce((sum, value) => sum + value, 0) / odds.length
      : null,
    positiveClvCount: clv.filter((value) => value > 0).length,
    clvSampleSize: clv.length,
    /*
     * The ratio (positiveClvCount/clvSampleSize) says how OFTEN a decision
     * beat the closing line; it says nothing about BY HOW MUCH. A customer
     * beating the close by a hair on most decisions and losing badly on a
     * few reads identically to one winning big and losing small under the
     * ratio alone -- the average magnitude is a different, complementary
     * fact.
     */
    averageClv: clv.length
      ? clv.reduce((sum, value) => sum + value, 0) / clv.length
      : null,
  };
}
