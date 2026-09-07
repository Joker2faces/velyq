import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import {
  FOOTBALL_DATA_DIVISIONS,
  IMPORT_VERSION,
  normalizeTeamKey,
  parseFootballDataCsv,
  seasonLabelFromDirectory,
  type CorpusMatch,
  type HistoricalMatch,
  type RejectedRow,
  type SupportedMarketCode,
} from "../../packages/research/src/index.js";

/**
 * Loads the local Football-Data.co.uk corpus off disk and turns it into
 * training rows.
 *
 * File I/O and character encoding live here rather than in @velyq/research so
 * that package stays pure and testable. Both of those turn out to matter:
 *
 * - The files are not UTF-8. Team and referee names use Windows-1252, so
 *   reading them as UTF-8 mangles every accented club name into a replacement
 *   character — and since team identity is a normalized *name*, that silently
 *   splits one club into two. Current-season files, meanwhile, do start with a
 *   UTF-8 BOM. The decoder below picks per file rather than assuming.
 * - Division and season come from the filename, but the division inside the
 *   file is checked against it, so a mis-saved download is a rejection rather
 *   than a set of matches attributed to the wrong league.
 */

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);

export function decodeSourceFile(bytes: Buffer): string {
  if (bytes.subarray(0, 3).equals(UTF8_BOM))
    return new TextDecoder("utf-8").decode(bytes.subarray(3));
  /*
   * windows-1252 rather than latin1: they differ exactly in 0x80-0x9F, which
   * is where the publisher's curly apostrophe lives — and "Nott'm Forest" is
   * a real team name in this corpus.
   */
  return new TextDecoder("windows-1252").decode(bytes);
}

export type CorpusFile = Readonly<{
  fileName: string;
  sourceSeason: string;
  sourceDivision: string;
  canonicalCompetitionCode: string;
  contentSha256: string;
  byteLength: number;
  modifiedAt: string;
  oddsColumnFamily: "BETBRAIN" | "MARKET_AVERAGE" | "NONE";
  closingPricesAvailable: boolean;
  rowsAccepted: number;
  rowsRejected: number;
  rowsUnplayed: number;
  rejections: readonly RejectedRow[];
  matches: readonly HistoricalMatch[];
}>;

/** `2425_E0.csv` -> season `2425`, division `E0`. */
export function parseCorpusFileName(
  fileName: string,
): Readonly<{ sourceSeason: string; sourceDivision: string }> | null {
  const match = fileName.match(/^(\d{4})_([A-Z0-9]+)\.csv$/);
  if (!match) return null;
  const sourceSeason = match[1] ?? "";
  const sourceDivision = match[2] ?? "";
  return seasonLabelFromDirectory(sourceSeason) === null
    ? null
    : { sourceSeason, sourceDivision };
}

export function loadCorpusFiles(directory: string): readonly CorpusFile[] {
  const files: CorpusFile[] = [];
  for (const fileName of readdirSync(directory).sort()) {
    const identity = parseCorpusFileName(fileName);
    if (!identity) continue;
    const canonicalCompetitionCode =
      FOOTBALL_DATA_DIVISIONS[identity.sourceDivision];
    if (canonicalCompetitionCode === undefined) continue;
    const filePath = path.join(directory, fileName);
    const bytes = readFileSync(filePath);
    const parsed = parseFootballDataCsv({
      csv: decodeSourceFile(bytes),
      sourceSeason: identity.sourceSeason,
      expectedDivision: identity.sourceDivision,
    });
    files.push({
      fileName,
      sourceSeason: identity.sourceSeason,
      sourceDivision: identity.sourceDivision,
      canonicalCompetitionCode,
      contentSha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
      byteLength: bytes.byteLength,
      modifiedAt: statSync(filePath).mtime.toISOString(),
      oddsColumnFamily: parsed.oddsColumnFamily,
      closingPricesAvailable: parsed.closingPricesAvailable,
      rowsAccepted: parsed.matches.length,
      rowsRejected: parsed.rejected.length,
      rowsUnplayed: parsed.unplayed,
      rejections: parsed.rejected,
      matches: parsed.matches,
    });
  }
  return files;
}

/** The panel-average pre-closing prices, in each market's canonical order. */
function preClosingAverageOdds(
  match: HistoricalMatch,
): Readonly<Partial<Record<SupportedMarketCode, readonly string[]>>> {
  const pick = (
    marketCode: SupportedMarketCode,
    outcomes: readonly string[],
  ) => {
    const prices = outcomes.map(
      (outcomeCode) =>
        match.quotes.find(
          (quote) =>
            quote.marketCode === marketCode &&
            quote.outcomeCode === outcomeCode &&
            quote.phase === "PRE_CLOSING" &&
            quote.scope === "AVERAGE",
        )?.decimalOdds,
    );
    return prices.every((price): price is string => price !== undefined)
      ? prices
      : undefined;
  };
  const result: Partial<Record<SupportedMarketCode, readonly string[]>> = {};
  const oneXTwo = pick("FOOTBALL_FULL_TIME_1X2", ["HOME", "DRAW", "AWAY"]);
  if (oneXTwo) result.FOOTBALL_FULL_TIME_1X2 = oneXTwo;
  const total = pick("FOOTBALL_FULL_TIME_TOTAL", ["OVER", "UNDER"]);
  if (total) result.FOOTBALL_FULL_TIME_TOTAL = total;
  /*
   * No both-teams-to-score entry, ever: Football-Data publishes no such
   * column. The market's *outcome* is derivable from the score, so the model
   * can be trained and scored on it, but there is no historical price to
   * compare against — so its market baseline is legitimately absent rather
   * than approximated from the 1X2 book.
   */
  return result;
}

export type DuplicateGroup = Readonly<{
  key: string;
  occurrences: number;
}>;

export type CorpusQualityReport = Readonly<{
  sourceCode: "FOOTBALL_DATA_UK";
  importVersion: string;
  files: number;
  seasons: readonly string[];
  competitions: readonly Readonly<{
    canonicalCompetitionCode: string;
    sourceDivision: string;
    matches: number;
    seasons: number;
    firstKickoff: string;
    lastKickoff: string;
    teams: number;
    matchesWith1x2Average: number;
    matchesWithTotalAverage: number;
    matchesWithClosing1x2: number;
  }>[];
  rowsRaw: number;
  rowsAccepted: number;
  rowsRejected: number;
  rowsUnplayed: number;
  rejectionsByReason: Readonly<Record<string, number>>;
  duplicates: readonly DuplicateGroup[];
  quotesTotal: number;
  quotesByPhaseAndScope: Readonly<Record<string, number>>;
  filesWithoutClosingPrices: number;
  oddsColumnFamilies: Readonly<Record<string, number>>;
}>;

export type LoadedCorpus = Readonly<{
  files: readonly CorpusFile[];
  matches: readonly CorpusMatch[];
  quality: CorpusQualityReport;
}>;

/**
 * Assembles the training rows and reports on the data honestly.
 *
 * Duplicates are detected on competition, date and the two team names — the
 * same match published twice, which happens when a season file is re-released
 * with a correction. The first occurrence wins and the rest are reported
 * rather than silently dropped, because a large duplicate count would mean the
 * download itself is wrong and no model should be fitted until it is
 * explained.
 */
export function loadCorpus(directory: string): LoadedCorpus {
  const files = loadCorpusFiles(directory);
  const seen = new Map<string, number>();
  const matches: CorpusMatch[] = [];
  const rejectionsByReason: Record<string, number> = {};
  const quotesByPhaseAndScope: Record<string, number> = {};
  const oddsColumnFamilies: Record<string, number> = {};
  let quotesTotal = 0;

  type CompetitionAccumulator = {
    sourceDivision: string;
    matches: number;
    seasons: Set<string>;
    firstKickoff: string;
    lastKickoff: string;
    teams: Set<string>;
    matchesWith1x2Average: number;
    matchesWithTotalAverage: number;
    matchesWithClosing1x2: number;
  };
  const byCompetition = new Map<string, CompetitionAccumulator>();

  for (const file of files) {
    oddsColumnFamilies[file.oddsColumnFamily] =
      (oddsColumnFamilies[file.oddsColumnFamily] ?? 0) + 1;
    for (const rejection of file.rejections)
      rejectionsByReason[rejection.reason] =
        (rejectionsByReason[rejection.reason] ?? 0) + 1;

    for (const match of file.matches) {
      const homeTeamKey = normalizeTeamKey(match.sourceHomeName);
      const awayTeamKey = normalizeTeamKey(match.sourceAwayName);
      const key = `${file.canonicalCompetitionCode}|${match.kickoffDate}|${homeTeamKey}|${awayTeamKey}`;
      const occurrences = (seen.get(key) ?? 0) + 1;
      seen.set(key, occurrences);
      if (occurrences > 1) continue;

      quotesTotal += match.quotes.length;
      for (const quote of match.quotes) {
        const bucket = `${quote.phase}_${quote.scope}`;
        quotesByPhaseAndScope[bucket] =
          (quotesByPhaseAndScope[bucket] ?? 0) + 1;
      }

      const odds = preClosingAverageOdds(match);
      matches.push({
        competitionCode: file.canonicalCompetitionCode,
        homeTeamKey,
        awayTeamKey,
        homeGoals: match.homeGoals,
        awayGoals: match.awayGoals,
        kickoffDate: match.kickoffDate,
        preClosingAverageOdds: odds,
      });

      const accumulator = byCompetition.get(file.canonicalCompetitionCode) ?? {
        sourceDivision: file.sourceDivision,
        matches: 0,
        seasons: new Set<string>(),
        firstKickoff: match.kickoffDate,
        lastKickoff: match.kickoffDate,
        teams: new Set<string>(),
        matchesWith1x2Average: 0,
        matchesWithTotalAverage: 0,
        matchesWithClosing1x2: 0,
      };
      accumulator.matches += 1;
      accumulator.seasons.add(match.seasonLabel);
      accumulator.teams.add(homeTeamKey);
      accumulator.teams.add(awayTeamKey);
      if (match.kickoffDate < accumulator.firstKickoff)
        accumulator.firstKickoff = match.kickoffDate;
      if (match.kickoffDate > accumulator.lastKickoff)
        accumulator.lastKickoff = match.kickoffDate;
      if (odds.FOOTBALL_FULL_TIME_1X2) accumulator.matchesWith1x2Average += 1;
      if (odds.FOOTBALL_FULL_TIME_TOTAL)
        accumulator.matchesWithTotalAverage += 1;
      if (
        match.quotes.some(
          (quote) =>
            quote.phase === "CLOSING" &&
            quote.scope === "AVERAGE" &&
            quote.marketCode === "FOOTBALL_FULL_TIME_1X2",
        )
      )
        accumulator.matchesWithClosing1x2 += 1;
      byCompetition.set(file.canonicalCompetitionCode, accumulator);
    }
  }

  const rowsAccepted = files.reduce((sum, file) => sum + file.rowsAccepted, 0);
  const rowsRejected = files.reduce((sum, file) => sum + file.rowsRejected, 0);
  const rowsUnplayed = files.reduce((sum, file) => sum + file.rowsUnplayed, 0);

  return {
    files,
    matches,
    quality: {
      sourceCode: "FOOTBALL_DATA_UK",
      importVersion: IMPORT_VERSION,
      files: files.length,
      seasons: [...new Set(files.map((file) => file.sourceSeason))].sort(),
      competitions: [...byCompetition.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([canonicalCompetitionCode, accumulator]) => ({
          canonicalCompetitionCode,
          sourceDivision: accumulator.sourceDivision,
          matches: accumulator.matches,
          seasons: accumulator.seasons.size,
          firstKickoff: accumulator.firstKickoff,
          lastKickoff: accumulator.lastKickoff,
          teams: accumulator.teams.size,
          matchesWith1x2Average: accumulator.matchesWith1x2Average,
          matchesWithTotalAverage: accumulator.matchesWithTotalAverage,
          matchesWithClosing1x2: accumulator.matchesWithClosing1x2,
        })),
      rowsRaw: rowsAccepted + rowsRejected + rowsUnplayed,
      rowsAccepted,
      rowsRejected,
      rowsUnplayed,
      rejectionsByReason,
      duplicates: [...seen.entries()]
        .filter(([, occurrences]) => occurrences > 1)
        .map(([key, occurrences]) => ({ key, occurrences })),
      quotesTotal,
      quotesByPhaseAndScope,
      filesWithoutClosingPrices: files.filter(
        (file) => !file.closingPricesAvailable,
      ).length,
      oddsColumnFamilies,
    },
  };
}

async function main() {
  const directory =
    process.env["VELYQ_HISTORICAL_CORPUS_DIR"] ??
    "data/historical/football-data";
  const corpus = loadCorpus(directory);
  process.stdout.write(`${JSON.stringify(corpus.quality, null, 2)}\n`);
}

if (process.argv[1]?.endsWith("historical-corpus.ts")) void main();
