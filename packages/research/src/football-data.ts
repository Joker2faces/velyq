import type {
  HistoricalMatch,
  HistoricalQuote,
  PriceScope,
  RejectedRow,
  RejectionReason,
  ResearchOutcomeCode,
} from "./corpus.js";
import { derivedOutcomes } from "./corpus.js";

/**
 * Parses one Football-Data.co.uk results/odds CSV.
 *
 * The file format is not stable across the corpus, and pretending otherwise is
 * how a training set quietly loses a third of its prices. Two things change:
 *
 * - Up to and including 2018/19 the panel aggregates are Betbrain columns
 *   (`BbAvH`, `BbMxH`, `BbAv>2.5`), there are no closing prices, and there is
 *   no kickoff time. From 2019/20 the aggregates are market columns (`AvgH`,
 *   `MaxH`, `Avg>2.5`) and every file also carries closing prices (`AvgCH`,
 *   `AvgC>2.5`) and `Time`.
 * - Individual bookmaker columns come and go as bookmakers do.
 *
 * So this reads by column *name*, tolerates absent columns, and records which
 * family it actually found rather than assuming one.
 */

type Triple = readonly [string, string, string];
type Pair = readonly [string, string];

const AVERAGE_1X2: Readonly<
  Record<"PRE_CLOSING" | "CLOSING", readonly Triple[]>
> = Object.freeze({
  PRE_CLOSING: [
    ["AvgH", "AvgD", "AvgA"],
    ["BbAvH", "BbAvD", "BbAvA"],
  ],
  CLOSING: [["AvgCH", "AvgCD", "AvgCA"]],
});

const MAXIMUM_1X2: Readonly<
  Record<"PRE_CLOSING" | "CLOSING", readonly Triple[]>
> = Object.freeze({
  PRE_CLOSING: [
    ["MaxH", "MaxD", "MaxA"],
    ["BbMxH", "BbMxD", "BbMxA"],
  ],
  CLOSING: [["MaxCH", "MaxCD", "MaxCA"]],
});

const AVERAGE_TOTAL: Readonly<
  Record<"PRE_CLOSING" | "CLOSING", readonly Pair[]>
> = Object.freeze({
  PRE_CLOSING: [
    ["Avg>2.5", "Avg<2.5"],
    ["BbAv>2.5", "BbAv<2.5"],
  ],
  CLOSING: [["AvgC>2.5", "AvgC<2.5"]],
});

const MAXIMUM_TOTAL: Readonly<
  Record<"PRE_CLOSING" | "CLOSING", readonly Pair[]>
> = Object.freeze({
  PRE_CLOSING: [
    ["Max>2.5", "Max<2.5"],
    ["BbMx>2.5", "BbMx<2.5"],
  ],
  CLOSING: [["MaxC>2.5", "MaxC<2.5"]],
});

/**
 * The bookmakers whose own columns are read, rather than every column the
 * publisher has ever shipped.
 *
 * These have the widest coverage across the corpus. Individual bookmaker
 * prices are not used for probability estimation — the panel average is — but
 * they are what makes a defensible dispersion measure possible, and dispersion
 * is an uncertainty input.
 */
const BOOKMAKER_1X2: readonly Readonly<{
  code: string;
  columns: Triple;
  closingColumns: Triple;
}>[] = Object.freeze([
  {
    code: "bet365",
    columns: ["B365H", "B365D", "B365A"],
    closingColumns: ["B365CH", "B365CD", "B365CA"],
  },
  {
    code: "pinnacle",
    columns: ["PSH", "PSD", "PSA"],
    closingColumns: ["PSCH", "PSCD", "PSCA"],
  },
  {
    code: "william-hill",
    columns: ["WHH", "WHD", "WHA"],
    closingColumns: ["WHCH", "WHCD", "WHCA"],
  },
  {
    code: "bet-and-win",
    columns: ["BWH", "BWD", "BWA"],
    closingColumns: ["BWCH", "BWCD", "BWCA"],
  },
  {
    code: "interwetten",
    columns: ["IWH", "IWD", "IWA"],
    closingColumns: ["IWCH", "IWCD", "IWCA"],
  },
  {
    code: "vc-bet",
    columns: ["VCH", "VCD", "VCA"],
    closingColumns: ["VCCH", "VCCD", "VCCA"],
  },
  /*
   * These five appear in the upcoming-fixtures feed rather than the season
   * archives, so they contribute to a live consensus and to the dispersion
   * measure but never to a historical backtest. `betfair-exchange` is an
   * exchange rather than a book; its price is included because more
   * independent prices is strictly better evidence and the de-vig normalises
   * whatever overround each venue carries, but it is worth knowing that one
   * member of the panel has a different microstructure from the rest.
   */
  {
    code: "betfred",
    columns: ["BFDH", "BFDD", "BFDA"],
    closingColumns: ["BFDCH", "BFDCD", "BFDCA"],
  },
  {
    code: "betvictor",
    columns: ["BVH", "BVD", "BVA"],
    closingColumns: ["BVCH", "BVCD", "BVCA"],
  },
  {
    code: "paddy-power",
    columns: ["PPH", "PPD", "PPA"],
    closingColumns: ["PPCH", "PPCD", "PPCA"],
  },
  {
    code: "skybet",
    columns: ["SKBH", "SKBD", "SKBA"],
    closingColumns: ["SKBCH", "SKBCD", "SKBCA"],
  },
  {
    code: "betfair-exchange",
    columns: ["BFEH", "BFED", "BFEA"],
    closingColumns: ["BFECH", "BFECD", "BFECA"],
  },
]);

/**
 * The bookmakers that publish their own over/under 2.5 columns.
 *
 * A much shorter list than 1X2, and that asymmetry is real rather than an
 * omission: the publisher carries seven individual books for the match result
 * and two or three for totals. It matters because bookmaker coverage is an
 * eligibility gate, so the totals market legitimately clears a lower bar of
 * evidence than 1X2 on the same fixture.
 */
const BOOKMAKER_TOTAL_2_5: readonly Readonly<{
  code: string;
  columns: Pair;
  closingColumns: Pair;
}>[] = Object.freeze([
  {
    code: "bet365",
    columns: ["B365>2.5", "B365<2.5"],
    closingColumns: ["B365C>2.5", "B365C<2.5"],
  },
  {
    code: "pinnacle",
    columns: ["P>2.5", "P<2.5"],
    closingColumns: ["PC>2.5", "PC<2.5"],
  },
  {
    code: "betfair-exchange",
    columns: ["BFE>2.5", "BFE<2.5"],
    closingColumns: ["BFEC>2.5", "BFEC<2.5"],
  },
]);

/** Bookmaker codes this parser can read, for provisioning and for tests. */
export const FOOTBALL_DATA_BOOKMAKER_CODES: readonly string[] = Object.freeze([
  ...new Set([
    ...BOOKMAKER_1X2.map((bookmaker) => bookmaker.code),
    ...BOOKMAKER_TOTAL_2_5.map((bookmaker) => bookmaker.code),
  ]),
]);

/**
 * Reads one CSV line into a name-keyed row.
 *
 * Shared with the upcoming-fixtures feed, which uses the same column names for
 * prices and simply has no result columns.
 */
export function csvRows(csv: string): Readonly<{
  header: readonly string[];
  rows: readonly ReadonlyMap<string, string>[];
}> {
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/);
  const header = splitCsvLine(lines[0] ?? "").map((name) => name.trim());
  const rows: ReadonlyMap<string, string>[] = [];
  for (const line of lines.slice(1)) {
    if (line.trim() === "") continue;
    const fields = splitCsvLine(line);
    const row = new Map<string, string>();
    header.forEach((name, column) => row.set(name, fields[column] ?? ""));
    rows.push(row);
  }
  return { header, rows };
}

/** RFC-4180-ish: quoted fields with doubled quotes, nothing more exotic. */
export function splitCsvLine(line: string): readonly string[] {
  const fields: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quoted) {
      if (character === '"') {
        if (line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else quoted = false;
      } else current += character;
      continue;
    }
    if (character === '"') {
      quoted = true;
      continue;
    }
    if (character === ",") {
      fields.push(current);
      current = "";
      continue;
    }
    current += character;
  }
  fields.push(current);
  return fields;
}

/**
 * `dd/mm/yy` and `dd/mm/yyyy`, the only two forms the corpus uses.
 *
 * Two-digit years are windowed at 70 rather than assumed to be 20xx: the
 * publisher's archive reaches back to 1993, so `93` must not become 2093.
 */
export function parseFootballDataDate(value: string): string | null {
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!match) return null;
  const dayRaw = match[1] ?? "";
  const monthRaw = match[2] ?? "";
  const yearRaw = match[3] ?? "";
  const day = Number(dayRaw);
  const month = Number(monthRaw);
  const yearNumber = Number(yearRaw);
  const year =
    yearRaw.length === 4
      ? yearNumber
      : yearNumber >= 70
        ? 1900 + yearNumber
        : 2000 + yearNumber;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return null;
  return date.toISOString().slice(0, 10);
}

/** The publisher's season directory, e.g. `2425` -> `2024/2025`. */
export function seasonLabelFromDirectory(directory: string): string | null {
  const match = directory.match(/^(\d{2})(\d{2})$/);
  if (!match) return null;
  const startTwo = Number(match[1]);
  const endTwo = Number(match[2]);
  const start = startTwo >= 70 ? 1900 + startTwo : 2000 + startTwo;
  // A season directory always spans consecutive years, including across a
  // century boundary: `9900` is 1999/2000.
  const expectedEndTwo = (startTwo + 1) % 100;
  if (endTwo !== expectedEndTwo) return null;
  return `${start}/${start + 1}`;
}

function positiveOdds(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (!/^\d+(?:\.\d+)?$/.test(trimmed)) return null;
  const numeric = Number(trimmed);
  // A decimal price at or below 1 pays nothing back. That is a data error, not
  // a shortcut to a certainty.
  if (!Number.isFinite(numeric) || numeric <= 1) return null;
  return trimmed;
}

function wholeNumber(value: string | undefined): number | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const numeric = Number(trimmed);
  return Number.isSafeInteger(numeric) && numeric >= 0 && numeric <= 30
    ? numeric
    : null;
}

function firstCompleteGroup(
  row: ReadonlyMap<string, string>,
  candidates: readonly (readonly string[])[],
): readonly string[] | null {
  for (const columns of candidates) {
    const values = columns.map((column) => positiveOdds(row.get(column)));
    if (values.every((value) => value !== null)) return values as string[];
  }
  return null;
}

export function quotesFor(
  row: ReadonlyMap<string, string>,
): readonly HistoricalQuote[] {
  const quotes: HistoricalQuote[] = [];
  const push = (
    marketCode: HistoricalQuote["marketCode"],
    outcomes: readonly ResearchOutcomeCode[],
    line: string | null,
    phase: HistoricalQuote["phase"],
    scope: PriceScope,
    bookmakerCode: string | null,
    values: readonly string[],
  ) => {
    outcomes.forEach((outcomeCode, index) => {
      const decimalOdds = values[index];
      if (decimalOdds === undefined) return;
      quotes.push({
        marketCode,
        outcomeCode,
        line,
        phase,
        scope,
        bookmakerCode,
        decimalOdds,
      });
    });
  };

  for (const phase of ["PRE_CLOSING", "CLOSING"] as const) {
    const groups = [
      {
        candidates: AVERAGE_1X2[phase],
        market: "FOOTBALL_FULL_TIME_1X2" as const,
        outcomes: ["HOME", "DRAW", "AWAY"] as const,
        line: null,
        scope: "AVERAGE" as const,
      },
      {
        candidates: MAXIMUM_1X2[phase],
        market: "FOOTBALL_FULL_TIME_1X2" as const,
        outcomes: ["HOME", "DRAW", "AWAY"] as const,
        line: null,
        scope: "MAXIMUM" as const,
      },
      {
        candidates: AVERAGE_TOTAL[phase],
        market: "FOOTBALL_FULL_TIME_TOTAL" as const,
        outcomes: ["OVER", "UNDER"] as const,
        line: "2.5",
        scope: "AVERAGE" as const,
      },
      {
        candidates: MAXIMUM_TOTAL[phase],
        market: "FOOTBALL_FULL_TIME_TOTAL" as const,
        outcomes: ["OVER", "UNDER"] as const,
        line: "2.5",
        scope: "MAXIMUM" as const,
      },
    ];
    for (const group of groups) {
      const values = firstCompleteGroup(row, group.candidates);
      if (!values) continue;
      push(
        group.market,
        group.outcomes,
        group.line,
        phase,
        group.scope,
        null,
        values,
      );
    }
    for (const bookmaker of BOOKMAKER_1X2) {
      const columns =
        phase === "CLOSING" ? bookmaker.closingColumns : bookmaker.columns;
      const values = firstCompleteGroup(row, [columns]);
      if (!values) continue;
      push(
        "FOOTBALL_FULL_TIME_1X2",
        ["HOME", "DRAW", "AWAY"],
        null,
        phase,
        "BOOKMAKER",
        bookmaker.code,
        values,
      );
    }
    for (const bookmaker of BOOKMAKER_TOTAL_2_5) {
      const columns =
        phase === "CLOSING" ? bookmaker.closingColumns : bookmaker.columns;
      const values = firstCompleteGroup(row, [columns]);
      if (!values) continue;
      push(
        "FOOTBALL_FULL_TIME_TOTAL",
        ["OVER", "UNDER"],
        "2.5",
        phase,
        "BOOKMAKER",
        bookmaker.code,
        values,
      );
    }
  }
  return quotes;
}

export type ParsedFootballDataFile = Readonly<{
  matches: readonly HistoricalMatch[];
  rejected: readonly RejectedRow[];
  /** Rows that are a placeholder for a fixture not yet played. */
  unplayed: number;
  oddsColumnFamily: "BETBRAIN" | "MARKET_AVERAGE" | "NONE";
  closingPricesAvailable: boolean;
  columnCount: number;
}>;

export function parseFootballDataCsv(
  input: Readonly<{
    csv: string;
    /** The publisher's season directory this file came from, e.g. `2425`. */
    sourceSeason: string;
    /** The division expected in the file, e.g. `E0`. */
    expectedDivision: string;
  }>,
): ParsedFootballDataFile {
  const lines = input.csv.replace(/^\uFEFF/, "").split(/\r?\n/);
  const header = splitCsvLine(lines[0] ?? "").map((name) => name.trim());
  const headerSet = new Set(header);
  const oddsColumnFamily = headerSet.has("AvgH")
    ? "MARKET_AVERAGE"
    : headerSet.has("BbAvH")
      ? "BETBRAIN"
      : "NONE";
  const seasonLabel = seasonLabelFromDirectory(input.sourceSeason);

  const matches: HistoricalMatch[] = [];
  const rejected: RejectedRow[] = [];
  let unplayed = 0;
  const reject = (
    lineNumber: number,
    reason: RejectionReason,
    detail: string,
  ) => rejected.push({ lineNumber, reason, detail });

  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const lineNumber = index + 1;
    if (line.trim() === "") continue;
    const fields = splitCsvLine(line);
    const row = new Map<string, string>();
    header.forEach((name, column) => row.set(name, fields[column] ?? ""));

    const division = (row.get("Div") ?? "").trim();
    const home = (row.get("HomeTeam") ?? "").trim();
    const away = (row.get("AwayTeam") ?? "").trim();
    const homeGoalsRaw = (row.get("FTHG") ?? row.get("HG") ?? "").trim();

    /*
     * A current-season file ends with rows that carry a date and nothing else:
     * placeholders for fixtures not yet played. They are not corrupt, and
     * counting them as rejections would make the quality report cry wolf on
     * every in-season download.
     */
    if (home === "" && away === "" && homeGoalsRaw === "") {
      unplayed += 1;
      continue;
    }
    if (division === "") {
      reject(lineNumber, "MISSING_DIVISION", "no Div value");
      continue;
    }
    if (division !== input.expectedDivision) {
      reject(
        lineNumber,
        "MISSING_DIVISION",
        `expected ${input.expectedDivision}, found ${division}`,
      );
      continue;
    }
    if (home === "" || away === "") {
      reject(lineNumber, "MISSING_TEAM", `home=${home} away=${away}`);
      continue;
    }
    const rawDate = (row.get("Date") ?? "").trim();
    if (rawDate === "") {
      reject(lineNumber, "MISSING_DATE", `${home} v ${away}`);
      continue;
    }
    const kickoffDate = parseFootballDataDate(rawDate);
    if (kickoffDate === null || seasonLabel === null) {
      reject(
        lineNumber,
        "INVALID_DATE",
        `date=${rawDate} season=${input.sourceSeason}`,
      );
      continue;
    }
    const awayGoalsRaw = (row.get("FTAG") ?? row.get("AG") ?? "").trim();
    if (homeGoalsRaw === "" || awayGoalsRaw === "") {
      /*
       * A dated fixture with both teams named but no score is also simply not
       * played yet, which is the normal state of most of a current-season
       * file. Only a row that has a score the parser cannot read is a defect.
       */
      unplayed += 1;
      continue;
    }
    const homeGoals = wholeNumber(homeGoalsRaw);
    const awayGoals = wholeNumber(awayGoalsRaw);
    if (homeGoals === null || awayGoals === null) {
      reject(
        lineNumber,
        "INVALID_SCORE",
        `${home} v ${away} ${homeGoalsRaw}-${awayGoalsRaw}`,
      );
      continue;
    }
    /*
     * The file carries the result as its own column. Cross-checking it against
     * the score costs nothing and catches column misalignment — the failure
     * mode that would otherwise train the model on a shifted row.
     */
    const statedResult = (row.get("FTR") ?? row.get("Res") ?? "").trim();
    const expected = derivedOutcomes(homeGoals, awayGoals).result;
    const expectedLetter =
      expected === "HOME" ? "H" : expected === "AWAY" ? "A" : "D";
    if (statedResult !== "" && statedResult !== expectedLetter) {
      reject(
        lineNumber,
        "RESULT_DISAGREES_WITH_SCORE",
        `${home} v ${away} ${homeGoals}-${awayGoals} stated ${statedResult}`,
      );
      continue;
    }
    const time = (row.get("Time") ?? "").trim();
    matches.push({
      sourceDivision: division,
      sourceSeason: input.sourceSeason,
      seasonLabel,
      kickoffDate,
      kickoffTime: /^\d{1,2}:\d{2}$/.test(time) ? time.padStart(5, "0") : null,
      sourceHomeName: home,
      sourceAwayName: away,
      homeGoals,
      awayGoals,
      halfTimeHomeGoals: wholeNumber(row.get("HTHG")),
      halfTimeAwayGoals: wholeNumber(row.get("HTAG")),
      quotes: quotesFor(row),
    });
  }

  return {
    matches,
    rejected,
    unplayed,
    oddsColumnFamily,
    closingPricesAvailable: headerSet.has("AvgCH") || headerSet.has("MaxCH"),
    columnCount: header.length,
  };
}
