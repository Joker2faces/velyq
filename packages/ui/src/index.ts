export function formatDecimal(value: string | null, maximumFractionDigits = 2) {
  if (value === null) return "—";
  return new Intl.NumberFormat("en-GB", {
    maximumFractionDigits,
    useGrouping: false,
  }).format(Number(value));
}

export function formatPercent(value: string | null, maximumFractionDigits = 1) {
  if (value === null) return "—";
  return new Intl.NumberFormat("en-GB", {
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
