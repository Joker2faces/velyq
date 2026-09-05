export type Locale = "en" | "el";

type DecimalDisplayOptions = Readonly<{
  scalePower: number;
  minimumFractionDigits: number;
  maximumFractionDigits: number;
  signDisplay: "never" | "exceptZero";
  suffix: string;
}>;

function powerOfTen(exponent: number): bigint {
  return 10n ** BigInt(exponent);
}

function formatDecimalString(
  value: string,
  locale: Locale,
  options: DecimalDisplayOptions,
): string {
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) return "NaN";

  const negative = match[1] === "-";
  const fraction = match[3] ?? "";
  const coefficient = BigInt(`${match[2]}${fraction}`);
  const exponent =
    options.scalePower + options.maximumFractionDigits - fraction.length;
  let rounded: bigint;
  if (exponent >= 0) {
    rounded = coefficient * powerOfTen(exponent);
  } else {
    const divisor = powerOfTen(-exponent);
    const quotient = coefficient / divisor;
    const remainder = coefficient % divisor;
    rounded = quotient + (remainder * 2n >= divisor ? 1n : 0n);
  }

  const digits = rounded
    .toString()
    .padStart(options.maximumFractionDigits + 1, "0");
  const integer =
    options.maximumFractionDigits === 0
      ? digits
      : digits.slice(0, -options.maximumFractionDigits);
  const fixedFraction =
    options.maximumFractionDigits === 0
      ? ""
      : digits.slice(-options.maximumFractionDigits);
  const removableDigits =
    options.maximumFractionDigits - options.minimumFractionDigits;
  const renderedFraction = fixedFraction.replace(
    new RegExp(`0{0,${removableDigits}}$`),
    "",
  );
  const sign =
    rounded === 0n
      ? ""
      : negative
        ? "-"
        : options.signDisplay === "exceptZero"
          ? "+"
          : "";
  const separator = locale === "el" ? "," : ".";
  return `${sign}${integer}${renderedFraction ? `${separator}${renderedFraction}` : ""}${options.suffix}`;
}

function fractionDigits(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > 20)
    throw new RangeError(
      "maximumFractionDigits must be an integer from 0 to 20",
    );
  return value;
}

export function formatDecimal(
  value: string | null,
  maximumFractionDigits = 2,
  locale: Locale = "en",
) {
  if (value === null) return "—";
  const digits = fractionDigits(maximumFractionDigits);
  return formatDecimalString(value, locale, {
    scalePower: 0,
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
    signDisplay: "never",
    suffix: "",
  });
}

export function formatPercent(
  value: string | null,
  maximumFractionDigits = 1,
  locale: Locale = "en",
) {
  if (value === null) return "—";
  const digits = fractionDigits(maximumFractionDigits);
  return formatDecimalString(value, locale, {
    scalePower: 2,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    signDisplay: "exceptZero",
    suffix: "%",
  });
}

export function formatPercentagePoints(
  value: string | null,
  maximumFractionDigits = 1,
  locale: Locale = "en",
) {
  if (value === null) return "—";
  const digits = fractionDigits(maximumFractionDigits);
  return formatDecimalString(value, locale, {
    scalePower: 2,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    signDisplay: "exceptZero",
    suffix: " pp",
  });
}

export function formatDateTime(value: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).formatToParts(new Date(value));
  const rendered = parts
    .map((part) =>
      part.type === "day" ? part.value.padStart(2, "0") : part.value,
    )
    .join("");
  return rendered;
}

export const messages = {
  navToday: "Today",
  navEdge: "Edge",
  navRadar: "Radar",
  navMatchIntelligence: "Match Intelligence",
  navAccount: "Account",
  syntheticData: "Synthetic data",
  developmentHeuristic: "Development heuristic",
  experimental: "Experimental",
  observableOnly: "Observable only",
  signOut: "Sign out",
  noEvidence: "No evidence",
  radarMove: "Radar move",
  customerUnavailable: "Customer data is temporarily unavailable.",
  customerLoading: "Loading customer intelligence…",
  dataUnavailable: "Data is not available.",
  matchNotFound: "Match not found.",
} as const;

export const translations: Record<
  Locale,
  Partial<Record<MessageKey, string>>
> = {
  en: messages,
  el: {
    navToday: "Σήμερα",
    navEdge: "Edge",
    navRadar: "Radar",
    navMatchIntelligence: "Match Intelligence",
    navAccount: "Λογαριασμός",
    syntheticData: "Συνθετικά δεδομένα",
    developmentHeuristic: "Ερευνητικός δείκτης",
    experimental: "Πειραματικό",
    observableOnly: "Μόνο παρατηρήσεις",
    signOut: "Αποσύνδεση",
    noEvidence: "Χωρίς στοιχεία",
    radarMove: "Κίνηση Radar",
    customerUnavailable: "Τα δεδομένα δεν είναι προσωρινά διαθέσιμα.",
    customerLoading: "Φόρτωση intelligence…",
    dataUnavailable: "Τα δεδομένα δεν είναι διαθέσιμα.",
    matchNotFound: "Ο αγώνας δεν βρέθηκε.",
  },
};

export type MessageKey = keyof typeof messages;
export const message = (key: MessageKey) => messages[key];
export const translate = (key: MessageKey, locale: Locale = "en") =>
  translations[locale][key] ?? messages[key];
