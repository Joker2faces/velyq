import type { Tone } from "./domain-labels.js";
import type { Locale } from "./locale.js";
import { translate, type MessageKey } from "./messages.js";

/**
 * The presentation vocabulary for VELYQ's track record.
 *
 * The product argument is "don't just trust VELYQ, verify its history", and
 * that only works if the record reads as an audit rather than as a scoreboard.
 * Two decisions here carry that, and both are enforced by the types rather
 * than left to whoever builds the page.
 *
 * **Outcome and decision quality are separate values.** A signal published at
 * 1.85 against a fair price of 1.67 was a good decision whether or not the
 * bet won, and a signal that won at a price with no edge in it was a bad
 * decision that happened to pay. Collapsing the two — colouring a page green
 * because results came in — is how an evidence product becomes a casino
 * scoreboard. `OutcomeResult` and `DecisionQuality` are distinct unions with
 * distinct tones, so a surface cannot render one and imply the other.
 *
 * **Nothing here holds a number.** These are labels, tones and formatters. No
 * historical performance figure is invented anywhere in this module, because
 * there is no validated history yet; a surface built on it renders whatever
 * the data layer gives it, and renders an honest empty state when that is
 * nothing. `sampleSizeCaption` exists specifically so a small sample is
 * declared next to the statistic it undermines.
 */

// ------------------------------------------------------------- outcomes

/**
 * What happened to the market a signal named.
 *
 * `VOID` and `PUSH` are kept apart: a push is a settled result that returned
 * the stake, a void is a market that never settled at all. Reporting either
 * as the other misstates the sample.
 */
export const OUTCOME_RESULTS = ["WON", "LOST", "PUSH", "VOID"] as const;

export type OutcomeResult = (typeof OUTCOME_RESULTS)[number];

const OUTCOME_LABELS: Readonly<Record<OutcomeResult, MessageKey>> = {
  WON: "outcomeWon",
  LOST: "outcomeLost",
  PUSH: "outcomePush",
  VOID: "outcomeVoid",
};

export function outcomeLabel(code: string, locale: Locale) {
  const key = OUTCOME_LABELS[code as OutcomeResult];
  return key ? translate(key, locale) : humanize(code);
}

/**
 * Outcome tones are deliberately unemphatic.
 *
 * A won market takes the neutral text tone and a lost one takes the muted
 * tone — the words carry the result, and the reader is not congratulated. The
 * accent stays reserved for the model, which is what VELYQ is asking to be
 * judged on. This is the single most important line in the module: colouring
 * results is exactly the gamification the record has to avoid.
 */
export function outcomeTone(code: string): Tone {
  switch (code) {
    case "WON":
    case "LOST":
      return "neutral";
    case "PUSH":
    case "VOID":
      return "muted";
    default:
      return "muted";
  }
}

// ------------------------------------------------------ decision quality

/**
 * Whether the decision was sound, judged at the moment of publication.
 *
 * This is the axis VELYQ is accountable for, and the reason a track record is
 * worth publishing at all: it is knowable before the result and cannot be
 * revised after it.
 */
export const DECISION_QUALITIES = [
  "FORTRESS",
  "EDGE",
  "MARGINAL",
  "NO_EDGE",
] as const;

export type DecisionQuality = (typeof DECISION_QUALITIES)[number];

const DECISION_LABELS: Readonly<Record<DecisionQuality, MessageKey>> = {
  FORTRESS: "decisionFortress",
  EDGE: "decisionEdge",
  MARGINAL: "decisionMarginal",
  NO_EDGE: "decisionNoEdge",
};

export function decisionQualityLabel(code: string, locale: Locale) {
  const key = DECISION_LABELS[code as DecisionQuality];
  return key ? translate(key, locale) : humanize(code);
}

export function decisionQualityTone(code: string): Tone {
  switch (code) {
    case "FORTRESS":
    case "EDGE":
      return "positive";
    case "MARGINAL":
      return "caution";
    case "NO_EDGE":
      return "muted";
    default:
      return "neutral";
  }
}

// ------------------------------------------------------------------ CLV

/**
 * Closing line value: the published price measured against the closing price.
 *
 * The most honest single number in the record, because it is settled by the
 * market rather than by the result, and it is available on every signal
 * including the ones that lost.
 *
 * `direction` describes the movement, not a verdict: `beat` means the signal
 * was published at a better price than the market closed at. Whether that is
 * good depends on the position, so the tone is the market hue in both
 * directions and the sign and label carry the direction — the same rule the
 * rest of the product follows for price movement.
 */
export type ClvDirection = "beat" | "matched" | "missed" | "unknown";

export function clvDirection(value: string | null | undefined): ClvDirection {
  if (value === null || value === undefined || value.trim() === "") {
    return "unknown";
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "unknown";
  if (parsed > 0) return "beat";
  if (parsed < 0) return "missed";
  return "matched";
}

export function clvLabel(direction: ClvDirection, locale: Locale) {
  const keys: Readonly<Record<ClvDirection, MessageKey>> = {
    beat: "clvBeatClose",
    matched: "clvMatchedClose",
    missed: "clvMissedClose",
    unknown: "clvUnknown",
  };
  return translate(keys[direction], locale);
}

// --------------------------------------------------- calibration quality

/**
 * How well stated probabilities have matched observed frequencies.
 *
 * Reported as a band rather than a raw Brier score, because a Brier score is
 * not interpretable without a reference point — and the raw figure is shown
 * beside the band wherever the exact number matters, never instead of it.
 */
export const CALIBRATION_BANDS = [
  "STRONG",
  "REASONABLE",
  "DRIFTING",
  "INSUFFICIENT",
] as const;

export type CalibrationBand = (typeof CALIBRATION_BANDS)[number];

const CALIBRATION_LABELS: Readonly<Record<CalibrationBand, MessageKey>> = {
  STRONG: "calibrationStrong",
  REASONABLE: "calibrationReasonable",
  DRIFTING: "calibrationDrifting",
  INSUFFICIENT: "calibrationInsufficient",
};

export function calibrationLabel(code: string, locale: Locale) {
  const key = CALIBRATION_LABELS[code as CalibrationBand];
  return key ? translate(key, locale) : humanize(code);
}

export function calibrationTone(code: string): Tone {
  switch (code) {
    case "STRONG":
    case "REASONABLE":
      return "positive";
    case "DRIFTING":
      return "caution";
    default:
      return "muted";
  }
}

// -------------------------------------------------------- sample size

/**
 * The smallest sample worth drawing a conclusion from.
 *
 * Deliberately a presentation threshold, not a statistical claim: it decides
 * whether the UI qualifies a figure, and the domain remains the authority on
 * whether a figure means anything. A record that shows a hit rate over eleven
 * settled signals without saying "eleven" is misleading by omission, so this
 * exists to make the qualification unavoidable.
 */
export const MINIMUM_REPORTABLE_SAMPLE = 30;

export function isReportableSample(count: number) {
  return Number.isFinite(count) && count >= MINIMUM_REPORTABLE_SAMPLE;
}

export function sampleSizeCaption(count: number, locale: Locale) {
  return isReportableSample(count)
    ? translate("sampleSettled", locale).replace("{count}", String(count))
    : translate("sampleTooSmall", locale).replace("{count}", String(count));
}

// ----------------------------------------------------- model maturity

/**
 * How far the model behind a signal has been validated.
 *
 * Present because a track record spanning a model change is not one record,
 * and hiding that would be the most misleading thing the page could do. This
 * is customer-facing language, so it says what the reader needs — how much
 * weight to give the number — rather than naming an internal build state.
 */
export const MODEL_MATURITIES = ["VALIDATED", "PROVISIONAL", "EARLY"] as const;

export type ModelMaturity = (typeof MODEL_MATURITIES)[number];

const MATURITY_LABELS: Readonly<Record<ModelMaturity, MessageKey>> = {
  VALIDATED: "maturityValidated",
  PROVISIONAL: "maturityProvisional",
  EARLY: "maturityEarly",
};

export function modelMaturityLabel(code: string, locale: Locale) {
  const key = MATURITY_LABELS[code as ModelMaturity];
  return key ? translate(key, locale) : humanize(code);
}

export function modelMaturityTone(code: string): Tone {
  switch (code) {
    case "VALIDATED":
      return "positive";
    case "PROVISIONAL":
      return "caution";
    default:
      return "muted";
  }
}

function humanize(code: string) {
  const lower = code.replaceAll("_", " ").toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}
