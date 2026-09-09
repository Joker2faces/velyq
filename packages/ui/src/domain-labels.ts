import type { Locale } from "./locale.js";
import { translate, type MessageKey } from "./messages.js";
import { directionOf } from "./format.js";

/**
 * Presentation labels for domain enumerations.
 *
 * The domain emits stable SCREAMING_SNAKE codes. Those codes are contract
 * values and must never reach a customer's screen; this module is the single
 * place that turns them into localized, human sentences.
 *
 * Unknown codes fall back to a readable de-underscored form rather than
 * throwing, so a new domain value degrades gracefully instead of breaking a
 * page.
 */

function humanize(code: string) {
  const lower = code.replaceAll("_", " ").toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function lookup(
  map: Readonly<Record<string, MessageKey>>,
  code: string,
  locale: Locale,
) {
  const key = map[code];
  return key ? translate(key, locale) : humanize(code);
}

// ------------------------------------------------------- recommendations

const RECOMMENDATION_LABELS: Readonly<Record<string, MessageKey>> = {
  STRONG_EDGE: "recStrongEdge",
  WAIT: "recWait",
  WAIT_FOR_LINEUP: "recWaitForLineup",
  NO_BET: "recNoBet",
  INSUFFICIENT_DATA: "recInsufficientData",
  EDGE_DISAPPEARED: "recEdgeDisappeared",
};

const RECOMMENDATION_EXPLANATIONS: Readonly<Record<string, MessageKey>> = {
  STRONG_EDGE: "recStrongEdgeBody",
  WAIT: "recWaitBody",
  WAIT_FOR_LINEUP: "recWaitForLineupBody",
  NO_BET: "recNoBetBody",
  INSUFFICIENT_DATA: "recInsufficientDataBody",
  EDGE_DISAPPEARED: "recEdgeDisappearedBody",
};

export function recommendationLabel(code: string, locale: Locale) {
  return lookup(RECOMMENDATION_LABELS, code, locale);
}

/** The sentence that must always travel next to the verdict it explains. */
export function recommendationExplanation(code: string, locale: Locale) {
  return lookup(RECOMMENDATION_EXPLANATIONS, code, locale);
}

/**
 * Visual tone for a recommendation.
 *
 * `EDGE_DISAPPEARED` is deliberately distinct from `NO_BET`: one says the
 * opportunity closed, the other says there never was one.
 */
export type Tone =
  | "positive"
  | "caution"
  | "neutral"
  | "muted"
  | "market"
  | "synthetic"
  | "heuristic";

export function recommendationTone(code: string): Tone {
  switch (code) {
    case "STRONG_EDGE":
      return "positive";
    case "WAIT":
    case "WAIT_FOR_LINEUP":
      return "caution";
    case "EDGE_DISAPPEARED":
      return "market";
    case "INSUFFICIENT_DATA":
      return "muted";
    default:
      return "neutral";
  }
}

/** True when the domain withheld an estimate rather than producing one. */
export function isGatedRecommendation(code: string) {
  return (
    code === "WAIT_FOR_LINEUP" ||
    code === "INSUFFICIENT_DATA" ||
    code === "NO_BET"
  );
}

// ------------------------------------------------------------ selections

/**
 * Keyed on the canonical outcome code the read model emits.
 *
 * Previously keyed on "Home"/"Draw"/"Away" -- the display strings the
 * synthetic demo corpus happened to use. Real data supplies the catalog's
 * outcome code, so nothing matched, and the function's fallback returned the
 * input unchanged: customers were shown `outcome.home`, an internal
 * translation key, as the name of their selection.
 *
 * The `outcome.*` forms are mapped too. They are not expected on this
 * boundary any more, but a fallback that silently prints an internal
 * identifier is precisely how the leak reached production, so the map
 * absorbs them rather than trusting no producer will ever send one.
 */
const SELECTION_LABELS: Readonly<Record<string, MessageKey>> = {
  HOME: "selectionHome",
  DRAW: "selectionDraw",
  AWAY: "selectionAway",
  "outcome.home": "selectionHome",
  "outcome.draw": "selectionDraw",
  "outcome.away": "selectionAway",
  /* Retained so the demo corpus and any older payload still read correctly. */
  Home: "selectionHome",
  Draw: "selectionDraw",
  Away: "selectionAway",
};

/**
 * Anything shaped like an internal identifier rather than a label.
 *
 * A dotted lower-case token ("outcome.home", "market.ft_1x2") or a
 * SCREAMING_SNAKE enum is a domain identifier, never customer-facing copy.
 */
function looksInternal(value: string): boolean {
  return (
    /^[a-z][a-z0-9]*(\.[a-z0-9_]+)+$/.test(value) ||
    /^[A-Z0-9_]{2,}$/.test(value)
  );
}

/**
 * Human label for a market selection.
 *
 * 1X2 outcomes are translated. Over/under lines are deliberately left as the
 * provider states them — "Over 2.5" is what Greek betting markets actually
 * print, and localising it would read as an invention.
 *
 * An unmapped value that looks like an internal identifier is replaced with a
 * neutral dash rather than printed. Showing nothing is a small loss; showing
 * `outcome.home` tells a customer they are looking at a developer's data
 * model.
 */
export function selectionLabel(selection: string, locale: Locale) {
  const key = SELECTION_LABELS[selection];
  if (key) return translate(key, locale);
  return looksInternal(selection) ? "—" : selection;
}

// ------------------------------------------------------------- movement

/**
 * What a market's movement means, or that it cannot be established.
 *
 * Takes the movement *state* rather than inferring from the percentage,
 * because a null percentage has two incompatible meanings. RADAR used to
 * infer, so an unavailable figure became the assertion "Price unchanged" --
 * shown, in production, on rows whose own opening and current prices
 * disagreed. Freshness is deliberately not part of this: a stale price may
 * still have moved, and a current one may not have.
 */
export function movementLabel(
  state: "MOVED" | "UNCHANGED" | "INSUFFICIENT_HISTORY",
  movementPercent: string | null | undefined,
  locale: Locale,
) {
  if (state === "INSUFFICIENT_HISTORY")
    return translate("radarMovementUnknown", locale);
  if (state === "UNCHANGED") return translate("radarUnchanged", locale);
  const direction = directionOf(movementPercent);
  return translate(
    direction === "up" ? "radarDrifted" : "radarShortened",
    locale,
  );
}

// -------------------------------------------------------------- lineups

const LINEUP_LABELS: Readonly<Record<string, MessageKey>> = {
  OFFICIAL: "lineupOfficial",
  EXPECTED: "lineupExpected",
  MISSING: "lineupMissing",
  CHANGED: "lineupChanged",
};

export function lineupLabel(code: string, locale: Locale) {
  return lookup(LINEUP_LABELS, code, locale);
}

export function lineupTone(code: string): Tone {
  if (code === "OFFICIAL") return "positive";
  if (code === "MISSING") return "caution";
  return "neutral";
}

// ------------------------------------------------------------ freshness

const FRESHNESS_LABELS: Readonly<Record<string, MessageKey>> = {
  FRESH: "freshnessFresh",
  STALE: "freshnessStale",
};

export function freshnessLabel(code: string, locale: Locale) {
  return lookup(FRESHNESS_LABELS, code, locale);
}

export function freshnessTone(code: string): Tone {
  return code === "FRESH" ? "positive" : "caution";
}

// ---------------------------------------------------------- reason codes

const REASON_LABELS: Readonly<Record<string, MessageKey>> = {
  MISSING_LINEUP: "reasonMissingLineup",
  STALE_DATA: "reasonStaleData",
  MISSING_PRICE: "reasonMissingPrice",
  WAITING_FOR_CONFIRMATION: "reasonWaitingForConfirmation",
  LOW_MAPPING_CONFIDENCE: "reasonLowMappingConfidence",
  EDGE_DISAPPEARED: "reasonEdgeDisappeared",
  REPRICED: "reasonRepriced",
  INSUFFICIENT_COVERAGE: "reasonInsufficientCoverage",
};

export function reasonLabel(code: string, locale: Locale) {
  return lookup(REASON_LABELS, code, locale);
}

export function reasonLabels(codes: readonly string[], locale: Locale) {
  return codes.map((code) => reasonLabel(code, locale));
}

// --------------------------------------------------------- quality grade

/**
 * Grade A–F mapped onto a tone and a 0–100 meter position.
 *
 * The meter is presentation only; `quality.score` remains the authority and
 * is displayed alongside it wherever the exact figure matters.
 */
export function qualityTone(grade: string): Tone {
  if (grade === "A" || grade === "B") return "positive";
  if (grade === "C" || grade === "D") return "caution";
  return "muted";
}

export function qualityMeter(grade: string): number {
  switch (grade) {
    case "A":
      return 100;
    case "B":
      return 80;
    case "C":
      return 60;
    case "D":
      return 40;
    case "E":
      return 20;
    default:
      return 8;
  }
}

// ------------------------------------------------- subscription statuses

const STATUS_LABELS: Readonly<Record<string, MessageKey>> = {
  active: "accountStatusActive",
  trialing: "accountStatusTrialing",
  past_due: "accountStatusPastDue",
  canceled: "accountStatusCanceled",
  unpaid: "accountStatusUnpaid",
  incomplete: "accountStatusIncomplete",
  incomplete_expired: "accountStatusIncompleteExpired",
};

export function subscriptionStatusLabel(
  status: string | null | undefined,
  locale: Locale,
) {
  if (!status) return translate("accountStatusNone", locale);
  return lookup(STATUS_LABELS, status, locale);
}

// ----------------------------------------------------------- entitlements

const ENTITLEMENT_LABELS: Readonly<Record<string, MessageKey>> = {
  "today.view": "entitlementTodayView",
  "edge.preview": "entitlementEdgePreview",
  "edge.full": "entitlementEdgeFull",
  "radar.preview": "entitlementRadarPreview",
  "radar.full": "entitlementRadarFull",
  "match.detail": "entitlementMatchDetail",
};

export function entitlementLabel(code: string, locale: Locale) {
  const key = ENTITLEMENT_LABELS[code];
  return key ? translate(key, locale) : code;
}
