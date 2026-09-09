import {
  divideDecimalStrings,
  numericColumnToDecimalString,
  subtractDecimalStrings,
  type DecimalString,
} from "@velyq/decimal";

/**
 * Opening, current and movement for one market outcome.
 *
 * This exists because the customer surfaces were showing bookmaker spread as
 * though it were price movement. The read model returns every observation for
 * an outcome ordered by `providerObservedAt`, and the mapper took the first
 * and last rows as "opening" and "current" -- but a single provider response
 * yields one observation *per bookmaker* at one instant, so those two rows
 * were two different bookmakers at the same moment. RADAR reported
 * "1.27 -> 1.30" for a market that had never moved, and separately reported
 * "Price unchanged", which is how the contradiction became visible.
 *
 * Movement is therefore only ever computed *between distinct observation
 * times*, and an outcome observed at a single instant has no movement to
 * report -- which is a different statement from "the price did not change".
 */

/**
 * Why a movement figure is or is not available.
 *
 * `INSUFFICIENT_HISTORY` is deliberately distinct from `UNCHANGED`. The first
 * says we cannot know, the second asserts a fact about the market, and
 * collapsing them into one label is what let a computation failure be
 * displayed to a customer as "Price unchanged".
 */
export type OddsMovementState = "MOVED" | "UNCHANGED" | "INSUFFICIENT_HISTORY";

export type OddsMovementObservation = Readonly<{
  decimalOdds: string;
  providerObservedAt: Date;
}>;

export type OddsMovementSummary = Readonly<{
  /** Best price at the earliest observed instant; null without two instants. */
  openingOdds: DecimalString | null;
  /** Best price at the latest observed instant. */
  currentOdds: DecimalString | null;
  /** `(current - opening) / opening`, or null when not establishable. */
  movementPercent: DecimalString | null;
  state: OddsMovementState;
  /** Distinct observation instants, so a caller can explain the state. */
  observationTimes: number;
}>;

const EMPTY: OddsMovementSummary = {
  openingOdds: null,
  currentOdds: null,
  movementPercent: null,
  state: "INSUFFICIENT_HISTORY",
  observationTimes: 0,
};

/**
 * The representative price for one instant.
 *
 * Best available price across the bookmakers observed at that instant. A
 * backer's opportunity is the best price on offer, so comparing best-to-best
 * measures the movement that matters to them -- and it is stable against the
 * panel changing size between observations in a way that "first bookmaker in
 * the response" is not.
 */
function bestAt(
  observations: readonly OddsMovementObservation[],
): DecimalString | null {
  let best: DecimalString | null = null;
  let bestValue = Number.NEGATIVE_INFINITY;
  for (const observation of observations) {
    const parsed = numericColumnToDecimalString(observation.decimalOdds);
    if (!parsed.ok) continue;
    /*
     * Compared as a number only to *choose* between candidates; the value
     * carried forward is always the exact decimal string, so no arithmetic
     * downstream inherits float error.
     */
    const value = Number(parsed.value);
    if (!Number.isFinite(value)) continue;
    if (value > bestValue) {
      bestValue = value;
      best = parsed.value;
    }
  }
  return best;
}

export function summariseOddsMovement(
  observations: readonly OddsMovementObservation[],
): OddsMovementSummary {
  if (observations.length === 0) return EMPTY;

  /*
   * Grouped by the provider's own observation time, never by ingestion
   * order. A late-arriving payload describing an earlier moment must land in
   * its own chronological place -- otherwise a delayed response would invert
   * opening and current and invent movement in the wrong direction.
   */
  const byInstant = new Map<number, OddsMovementObservation[]>();
  for (const observation of observations) {
    const at = observation.providerObservedAt.getTime();
    if (!Number.isFinite(at)) continue;
    byInstant.set(at, [...(byInstant.get(at) ?? []), observation]);
  }

  const instants = [...byInstant.keys()].sort((a, b) => a - b);
  if (instants.length === 0) return EMPTY;

  const currentOdds = bestAt(byInstant.get(instants.at(-1)!) ?? []);

  if (instants.length < 2) {
    /*
     * One instant: a real current price, and honestly no history. Opening is
     * left null rather than set to the same value, so no surface can present
     * a comparison that does not exist.
     */
    return {
      openingOdds: null,
      currentOdds,
      movementPercent: null,
      state: "INSUFFICIENT_HISTORY",
      observationTimes: 1,
    };
  }

  const openingOdds = bestAt(byInstant.get(instants[0]!) ?? []);
  if (openingOdds === null || currentOdds === null) {
    return {
      openingOdds,
      currentOdds,
      movementPercent: null,
      state: "INSUFFICIENT_HISTORY",
      observationTimes: instants.length,
    };
  }

  const delta = subtractDecimalStrings(currentOdds, openingOdds);
  if (!delta.ok) {
    /*
     * A failed computation is reported as unknown, never as unchanged. The
     * original defect was exactly this: scale-padded NUMERIC values were
     * rejected by the decimal parser, the failure became null, and null was
     * rendered as "Price unchanged".
     */
    return {
      openingOdds,
      currentOdds,
      movementPercent: null,
      state: "INSUFFICIENT_HISTORY",
      observationTimes: instants.length,
    };
  }

  const movement = divideDecimalStrings(delta.value, openingOdds);
  if (!movement.ok) {
    return {
      openingOdds,
      currentOdds,
      movementPercent: null,
      state: "INSUFFICIENT_HISTORY",
      observationTimes: instants.length,
    };
  }

  return {
    openingOdds,
    currentOdds,
    movementPercent: movement.value,
    /* Exact-zero only; a real move of any size is a move. */
    state: Number(movement.value) === 0 ? "UNCHANGED" : "MOVED",
    observationTimes: instants.length,
  };
}
