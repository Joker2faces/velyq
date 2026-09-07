/**
 * Decodes a Football-Data.co.uk file's bytes.
 *
 * Two things about these files that a plain `readFileSync(path, "utf8")` gets
 * wrong, both silently:
 *
 * - They are not UTF-8. Team and referee names are Windows-1252, so decoding
 *   as UTF-8 turns every accented club name into a replacement character. Team
 *   identity here *is* a normalized name, so that quietly splits one club into
 *   two and trains two half-strength sets of ratings.
 * - Current-season files do start with a UTF-8 byte-order mark. Left in place
 *   it becomes part of the first column's name, `Div` never matches, and the
 *   whole file parses as rows with no division.
 *
 * windows-1252 rather than latin1 because they differ exactly in 0x80-0x9F,
 * which is where the publisher's curly apostrophe lives, and "Nott'm Forest"
 * is a real team name in this corpus.
 */
const UTF8_BOM = Uint8Array.from([0xef, 0xbb, 0xbf]);

export function decodeSourceBytes(bytes: Uint8Array): string {
  const hasBom =
    bytes.length >= 3 &&
    bytes[0] === UTF8_BOM[0] &&
    bytes[1] === UTF8_BOM[1] &&
    bytes[2] === UTF8_BOM[2];
  return hasBom
    ? new TextDecoder("utf-8").decode(bytes.subarray(3))
    : new TextDecoder("windows-1252").decode(bytes);
}
