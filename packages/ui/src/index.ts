export type Locale = "en" | "el";

export function formatDecimal(
  value: string | null,
  maximumFractionDigits = 2,
  locale: Locale = "en",
) {
  if (value === null) return "—";
  return new Intl.NumberFormat(locale === "el" ? "el-GR" : "en-GB", {
    maximumFractionDigits,
    useGrouping: false,
  }).format(Number(value));
}

export function formatPercent(
  value: string | null,
  maximumFractionDigits = 1,
  locale: Locale = "en",
) {
  if (value === null) return "—";
  return new Intl.NumberFormat(locale === "el" ? "el-GR" : "en-GB", {
    style: "percent",
    minimumFractionDigits: maximumFractionDigits,
    maximumFractionDigits,
    signDisplay: "exceptZero",
  }).format(Number(value));
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
