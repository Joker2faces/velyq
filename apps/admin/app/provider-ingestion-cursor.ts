const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ProviderIngestionCursor = Readonly<{
  startedAt: Date;
  id: string;
}>;

export function formatProviderIngestionCursor(startedAt: Date, id: string) {
  return `${startedAt.toISOString()}|${id}`;
}

export function parseProviderIngestionCursor(
  value: string,
): ProviderIngestionCursor | null {
  const separator = value.indexOf("|");
  if (separator < 0 || value.indexOf("|", separator + 1) >= 0) return null;
  const timestamp = value.slice(0, separator);
  const id = value.slice(separator + 1);
  const startedAt = new Date(timestamp);
  if (
    !UUID_PATTERN.test(id) ||
    Number.isNaN(startedAt.getTime()) ||
    startedAt.toISOString() !== timestamp
  )
    return null;
  return { startedAt, id };
}
