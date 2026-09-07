/**
 * `@velyq/ui` — the customer presentation boundary.
 *
 * Everything a customer reads passes through here: locale resolution, the
 * bilingual message catalog, domain-enum labelling and number formatting.
 * Nothing in this package performs domain arithmetic.
 */
export {
  BRAND_MARK_CIRCLE,
  BRAND_MARK_SPOT,
  BRAND_MARK_STROKE,
  BRAND_MARK_TAIL,
  BRAND_MARK_VIEWBOX,
  BRAND_TILE_RADIUS,
} from "./brand.js";

export {
  SPORTS,
  isSport,
  sportLabel,
  sportScope,
  type Sport,
  type SportScope,
} from "./sport.js";

export {
  CALIBRATION_BANDS,
  DECISION_QUALITIES,
  MINIMUM_REPORTABLE_SAMPLE,
  MODEL_MATURITIES,
  OUTCOME_RESULTS,
  calibrationLabel,
  calibrationTone,
  clvDirection,
  clvLabel,
  decisionQualityLabel,
  decisionQualityTone,
  isReportableSample,
  modelMaturityLabel,
  modelMaturityTone,
  outcomeLabel,
  outcomeTone,
  sampleSizeCaption,
  type CalibrationBand,
  type ClvDirection,
  type DecisionQuality,
  type ModelMaturity,
  type OutcomeResult,
} from "./track-record.js";

export {
  dataMode,
  requiresPreviewDisclosure,
  type DataMode,
} from "./data-mode.js";

export {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_COOKIE,
  LOCALE_LABELS,
  LOCALE_SHORT_LABELS,
  intlLocale,
  parseLocale,
  type Locale,
} from "./locale.js";

export {
  EMPTY_VALUE,
  axisPercent,
  barPercent,
  directionOf,
  formatCount,
  formatDateTime,
  formatDecimal,
  formatLongDate,
  formatOdds,
  formatPercent,
  formatPointsDelta,
  formatPrice,
  formatProbability,
  formatTime,
  type ValueDirection,
} from "./format.js";

export {
  message,
  messages,
  translate,
  translations,
  translator,
  type MessageKey,
  type Translator,
} from "./messages.js";

export {
  entitlementLabel,
  freshnessLabel,
  freshnessTone,
  isGatedRecommendation,
  lineupLabel,
  lineupTone,
  qualityMeter,
  qualityTone,
  reasonLabel,
  reasonLabels,
  selectionLabel,
  recommendationExplanation,
  recommendationLabel,
  recommendationTone,
  subscriptionStatusLabel,
  type Tone,
} from "./domain-labels.js";
