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
  readonly sourceBookmakers: readonly string[];
  readonly reasonCodes: readonly string[];
}>;

type ValidObservation = Readonly<{
  readonly bookmaker: string;
  readonly observedAt: string;
  readonly observedAtInstant: number;
  readonly odds: DecimalOdds["value"];
}>;

const ISO_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;

function parseIsoTimestamp(value: string): number | null {
  const match = ISO_TIMESTAMP.exec(value);
  if (!match) return null;
  const [, yearRaw, monthRaw, dayRaw, hourRaw, minuteRaw, secondRaw] = match;
  const zone = match[7]!;
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  const second = Number(secondRaw);
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    (zone !== "Z" &&
      (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4, 6)) > 59))
  ) {
    return null;
  }
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  const instant = Date.parse(value);
  return Number.isFinite(instant) ? instant : null;
}

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
  sourceBookmakers: readonly string[],
  reasonCodes: readonly string[],
): RadarMovement {
  return Object.freeze({
    policyVersion: MOVEMENT_POLICY_VERSION,
    state,
    openingOdds,
    currentOdds,
    movement,
    bookmakerCount,
    sourceBookmakers: Object.freeze([...sourceBookmakers]),
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
  const candidates: ValidObservation[] = [];

  for (const observation of input.observations) {
    const observedAtInstant = parseIsoTimestamp(observation.observedAt);
    if (observedAtInstant === null) {
      if (!reasonCodes.includes("INVALID_OBSERVED_AT"))
        reasonCodes.push("INVALID_OBSERVED_AT");
      continue;
    }
    const odds = decimalOdds(observation.odds);
    if (!odds.ok) {
      if (!reasonCodes.includes("INVALID_ODDS"))
        reasonCodes.push("INVALID_ODDS");
      continue;
    }
    candidates.push(
      Object.freeze({
        bookmaker: observation.bookmaker,
        observedAt: observation.observedAt,
        observedAtInstant,
        odds: odds.value.value,
      }),
    );
  }

  candidates.sort(
    (left, right) =>
      left.observedAtInstant - right.observedAtInstant ||
      left.bookmaker.localeCompare(right.bookmaker) ||
      left.observedAt.localeCompare(right.observedAt) ||
      compareDecimal(left.odds, right.odds),
  );
  const observations: ValidObservation[] = [];
  const seen = new Set<string>();
  for (const observation of candidates) {
    const key = `${observation.bookmaker}\u0000${observation.observedAtInstant}`;
    if (seen.has(key)) {
      if (!reasonCodes.includes("DUPLICATE_BOOKMAKER_OBSERVATION"))
        reasonCodes.push("DUPLICATE_BOOKMAKER_OBSERVATION");
      continue;
    }
    seen.add(key);
    observations.push(observation);
  }
  const streams = new Map<string, ValidObservation[]>();
  for (const observation of observations) {
    const stream = streams.get(observation.bookmaker) ?? [];
    stream.push(observation);
    streams.set(observation.bookmaker, stream);
  }
  if (streams.size > 1) reasonCodes.push("MULTIPLE_BOOKMAKER_STREAMS");
  const bookmakerCount = streams.size;
  const selected = [...streams.entries()].sort(
    ([leftBookmaker, leftStream], [rightBookmaker, rightStream]) =>
      rightStream.length - leftStream.length ||
      leftBookmaker.localeCompare(rightBookmaker),
  )[0];
  const sourceBookmakers = selected ? [selected[0]] : [];
  const stream = selected?.[1] ?? [];

  if (stream.length < 2) {
    if (!reasonCodes.includes("INSUFFICIENT_HISTORY"))
      reasonCodes.push("INSUFFICIENT_HISTORY");
    return freezeMovement(
      "INSUFFICIENT_HISTORY",
      null,
      null,
      null,
      bookmakerCount,
      sourceBookmakers,
      reasonCodes,
    );
  }

  const openingOdds = stream[0]!.odds;
  const currentOdds = stream.at(-1)?.odds ?? null;
  if (!currentOdds) {
    return freezeMovement(
      "INSUFFICIENT_HISTORY",
      null,
      null,
      null,
      bookmakerCount,
      sourceBookmakers,
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
      sourceBookmakers,
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
    sourceBookmakers,
    reasonCodes,
  );
}
