import type { HistoryCursor } from "@velyq/database";

/**
 * Opaque to the client on purpose: a plain `{createdAt, id}` pair encoded as
 * base64, not a page number. History grows from the front (new decisions
 * insert above old ones), so an offset-based "page 3" would silently shift
 * under a customer mid-browse -- a keyset cursor names a row, not a
 * position, and is stable regardless of what has been decided since.
 */
export function encodeHistoryCursor(cursor: HistoryCursor): string {
  return Buffer.from(
    JSON.stringify({
      createdAt: cursor.createdAt.toISOString(),
      id: cursor.id,
    }),
  ).toString("base64url");
}

export function decodeHistoryCursor(
  raw: string | null,
): HistoryCursor | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(
      Buffer.from(raw, "base64url").toString("utf8"),
    ) as { createdAt?: unknown; id?: unknown };
    if (typeof parsed.createdAt !== "string" || typeof parsed.id !== "string")
      return undefined;
    const createdAt = new Date(parsed.createdAt);
    if (Number.isNaN(createdAt.getTime())) return undefined;
    return { createdAt, id: parsed.id };
  } catch {
    /* A malformed or tampered cursor is treated as "no cursor" -- the first
       page -- rather than an error the customer cannot act on. */
    return undefined;
  }
}
