import {
  decimalOdds,
  divideDecimalStrings,
  subtractDecimalStrings,
  type DecimalOdds,
  type DecimalString,
} from "@velyq/decimal";

export const MOVEMENT_POLICY_VERSION = "movement.v1" as const;

export type RadarObservation = Readonly<{
  readonly bookmaker: string;
  readonly observedAt: string;
  readonly odds: string;
}>;

export type RadarMovementState =
  "SHORTENED" | "DRIFTED" | "UNCHANGED" | "INSUFFICIENT_HISTORY";

export type RadarMovement = Readonly<{
  readonly policyVersion: typeof MOVEMENT_POLICY_VERSION;
  readonly state: RadarMovementState;
  readonly openingOdds: DecimalOdds["value"] | null;
  readonly currentOdds: DecimalOdds["value"] | null;
  readonly movement: DecimalString | null;
  readonly bookmakerCount: number;
  readonly reasonCodes: readonly string[];
}>;

type ValidObservation = Readonly<{
  readonly bookmaker: string;
  readonly observedAt: string;
  readonly odds: DecimalOdds["value"];
}>;

function compareDecimal(left: DecimalString, right: DecimalString): number {
  const difference = subtractDecimalStrings(left, right);
  if (!difference.ok || difference.value === ("0" as DecimalString)) return 0;
  return difference.value.startsWith("-") ? -1 : 1;
}

function freezeMovement(
  state: RadarMovementState,
  openingOdds: DecimalOdds["value"] | null,
  currentOdds: DecimalOdds["value"] | null,
  movement: DecimalString | null,
  bookmakerCount: number,
  reasonCodes: readonly string[],
): RadarMovement {
  return Object.freeze({
    policyVersion: MOVEMENT_POLICY_VERSION,
    state,
    openingOdds,
    currentOdds,
    movement,
    bookmakerCount,
    reasonCodes: Object.freeze([...reasonCodes]),
  });
}

/** Classifies observed odds movement without inferring sharp or steam activity. */
export function analyzeRadarMovement(
  input: Readonly<{
    readonly observations: readonly RadarObservation[];
  }>,
): RadarMovement {
  const reasonCodes: string[] = [];
  const seen = new Set<string>();
  const observations: ValidObservation[] = [];

  for (const observation of input.observations) {
    const key = `${observation.bookmaker}\u0000${observation.observedAt}`;
    if (seen.has(key)) {
      if (!reasonCodes.includes("DUPLICATE_BOOKMAKER_OBSERVATION"))
        reasonCodes.push("DUPLICATE_BOOKMAKER_OBSERVATION");
      continue;
    }
    seen.add(key);

    const odds = decimalOdds(observation.odds);
    if (!odds.ok) {
      if (!reasonCodes.includes("INVALID_ODDS"))
        reasonCodes.push("INVALID_ODDS");
      continue;
    }
    observations.push(
      Object.freeze({
        bookmaker: observation.bookmaker,
        observedAt: observation.observedAt,
        odds: odds.value.value,
      }),
    );
  }

  const bookmakerCount = new Set(observations.map(({ bookmaker }) => bookmaker))
    .size;
  observations.sort((left, right) =>
    left.observedAt === right.observedAt
      ? left.bookmaker.localeCompare(right.bookmaker)
      : left.observedAt.localeCompare(right.observedAt),
  );

  if (observations.length < 2) {
    if (!reasonCodes.includes("INSUFFICIENT_HISTORY"))
      reasonCodes.push("INSUFFICIENT_HISTORY");
    return freezeMovement(
      "INSUFFICIENT_HISTORY",
      null,
      null,
      null,
      bookmakerCount,
      reasonCodes,
    );
  }

  const openingOdds = observations[0]!.odds;
  const currentOdds = observations.at(-1)?.odds ?? null;
  if (!currentOdds) {
    return freezeMovement(
      "INSUFFICIENT_HISTORY",
      null,
      null,
      null,
      bookmakerCount,
      ["INSUFFICIENT_HISTORY"],
    );
  }
  const change = subtractDecimalStrings(currentOdds, openingOdds);
  const movement = change.ok
    ? divideDecimalStrings(change.value, openingOdds)
    : change;
  if (!change.ok || !movement.ok) {
    return freezeMovement(
      "INSUFFICIENT_HISTORY",
      openingOdds,
      currentOdds,
      null,
      bookmakerCount,
      ["MOVEMENT_CALCULATION_FAILED"],
    );
  }
  const comparison = compareDecimal(currentOdds, openingOdds);
  return freezeMovement(
    comparison < 0 ? "SHORTENED" : comparison > 0 ? "DRIFTED" : "UNCHANGED",
    openingOdds,
    currentOdds,
    movement.value,
    bookmakerCount,
    reasonCodes,
  );
}
