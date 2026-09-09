import type { Locale } from "@velyq/ui";
const EN: Record<string, string> = {
  MISSING_LINEUP: "Waiting for lineup",
  WAITING_FOR_CONFIRMATION: "Waiting for confirmation",
  STALE_DATA: "Stale odds",
  MISSING_PRICE: "Insufficient market data",
  INSUFFICIENT_COVERAGE: "Competition not supported",
  LOW_MAPPING_CONFIDENCE: "Identity unresolved",
  EDGE_DISAPPEARED: "Price no longer qualifies",
  REPRICED: "Price changed",
  INSUFFICIENT_DATA: "Insufficient history",
};
const EL: Record<string, string> = {
  MISSING_LINEUP: "Αναμονή ενδεκάδας",
  WAITING_FOR_CONFIRMATION: "Αναμονή επιβεβαίωσης",
  STALE_DATA: "Παρωχημένες αποδόσεις",
  MISSING_PRICE: "Ανεπαρκή δεδομένα αγοράς",
  INSUFFICIENT_COVERAGE: "Μη υποστηριζόμενη διοργάνωση",
  LOW_MAPPING_CONFIDENCE: "Μη επιβεβαιωμένη ταυτότητα",
  EDGE_DISAPPEARED: "Η τιμή δεν πληροί πλέον το όριο",
  REPRICED: "Η τιμή άλλαξε",
  INSUFFICIENT_DATA: "Ανεπαρκές ιστορικό",
};
export function forecastReason(code: string, locale: Locale): string {
  return (locale === "el" ? EL : EN)[code] ?? code.replaceAll("_", " ");
}
