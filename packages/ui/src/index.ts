/**
 * `@velyq/ui` — the customer presentation boundary.
 *
 * Everything a customer reads passes through here: locale resolution, the
 * bilingual message catalog, domain-enum labelling and number formatting.
 * Nothing in this package performs domain arithmetic.
 */
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
  formatPercentagePoints,
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
