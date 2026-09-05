import { DEFAULT_LOCALE, intlLocale, type Locale } from "./locale.js";

/**
 * Presentation formatting for customer-facing numbers.
 *
 * Every function here reads canonical decimal strings and returns display
 * text. Domain arithmetic stays in `@velyq/decimal`; nothing in this module
 * feeds a calculation back into the domain.
 */

/** Placeholder rendered whenever a value is genuinely unavailable. */
export const EMPTY_VALUE = "—";

function toFiniteNumber(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatDecimal(
  value: string | null,
  maximumFractionDigits = 2,
  locale: Locale = DEFAULT_LOCALE,
) {
  if (value === null) return EMPTY_VALUE;
  return new Intl.NumberFormat(intlLocale(locale), {
    maximumFractionDigits,
    useGrouping: false,
  }).format(Number(value));
}

/**
 * Decimal odds always render with exactly two fraction digits so that a
 * column of prices stays optically aligned (1.85, 2.00, 3.33).
 */
export function formatOdds(
  value: string | null | undefined,
  locale: Locale = DEFAULT_LOCALE,
) {
  const parsed = toFiniteNumber(value);
  if (parsed === null) return EMPTY_VALUE;
  return new Intl.NumberFormat(intlLocale(locale), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: false,
  }).format(parsed);
}

/**
 * Formats a fractional value (0.6 → 60.0%) with an explicit sign for any
 * non-zero result. Used for probability edge and expected value.
 */
export function formatPercent(
  value: string | null,
  maximumFractionDigits = 1,
  locale: Locale = DEFAULT_LOCALE,
) {
  if (value === null) return EMPTY_VALUE;
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "percent",
    minimumFractionDigits: maximumFractionDigits,
    maximumFractionDigits,
    signDisplay: "exceptZero",
  }).format(Number(value));
}

/**
 * Formats a fractional probability without a sign (0.540540… → 54.1%).
 * Probabilities are magnitudes, so a leading "+" would be noise.
 */
export function formatProbability(
  value: string | null | undefined,
  locale: Locale = DEFAULT_LOCALE,
) {
  const parsed = toFiniteNumber(value);
  if (parsed === null) return EMPTY_VALUE;
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(parsed);
}

/**
 * Formats a value that is *already expressed in percentage points*.
 *
 * `movementPercent` is produced as -11.904761904762 meaning -11.9%, so it
 * must not pass through `style: "percent"` (which would multiply by 100 and
 * render -1,190.5%).
 */
export function formatPercentagePoints(
  value: string | null | undefined,
  locale: Locale = DEFAULT_LOCALE,
) {
  const parsed = toFiniteNumber(value);
  if (parsed === null) return EMPTY_VALUE;
  const rendered = new Intl.NumberFormat(intlLocale(locale), {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    signDisplay: "exceptZero",
  }).format(parsed);
  return `${rendered}%`;
}

/** Sign classification used to pick a colour token, never to compute. */
export type ValueDirection = "up" | "down" | "flat" | "unknown";

export function directionOf(value: string | null | undefined): ValueDirection {
  const parsed = toFiniteNumber(value);
  if (parsed === null) return "unknown";
  if (parsed > 0) return "up";
  if (parsed < 0) return "down";
  return "flat";
}

/**
 * Maps a value onto a 0–100 bar width for presentation.
 *
 * `magnitude` is the value that fills the bar completely. The result is
 * clamped so that an outlier can never overflow its track.
 */
export function barPercent(
  value: string | null | undefined,
  magnitude: number,
): number {
  const parsed = toFiniteNumber(value);
  if (parsed === null || magnitude <= 0) return 0;
  const ratio = Math.abs(parsed) / magnitude;
  return Math.round(Math.min(1, ratio) * 1000) / 10;
}

/**
 * Renders an ISO timestamp in UTC. The output is intentionally stable across
 * locales for the date part ordering so that traces stay comparable.
 */
export function formatDateTime(value: string, locale: Locale = DEFAULT_LOCALE) {
  const parts = new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).formatToParts(new Date(value));
  return parts
    .map((part) =>
      part.type === "day" ? part.value.padStart(2, "0") : part.value,
    )
    .join("");
}

/** Kick-off time only, in UTC. */
export function formatTime(value: string, locale: Locale = DEFAULT_LOCALE) {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(new Date(value));
}

/** Long weekday + date, used as the Today page dateline. */
export function formatLongDate(value: string, locale: Locale = DEFAULT_LOCALE) {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

/** Two-digit counter used in metric tiles (3 → "03"). */
export function formatCount(value: number) {
  return String(Math.max(0, Math.trunc(value))).padStart(2, "0");
}

/** Monthly price in euro, without stray fraction digits for whole amounts. */
export function formatPrice(amount: number, locale: Locale = DEFAULT_LOCALE) {
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
