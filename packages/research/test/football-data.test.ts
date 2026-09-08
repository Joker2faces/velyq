import { describe, expect, it } from "vitest";
import {
  derivedOutcomes,
  parseFootballDataCsv,
  parseFootballDataDate,
  seasonLabelFromDirectory,
  splitCsvLine,
} from "../src/index.js";

/*
 * The header rows below are trimmed versions of two real Football-Data files:
 * the Betbrain-era layout used up to 2018/19 and the market-average layout
 * used from 2019/20. Both are parsed by the same code path on purpose — the
 * corpus contains 44 files of the first kind and 88 of the second, and a
 * parser that silently handled only one would drop four seasons of prices.
 */
const MARKET_HEADER =
  "Div,Date,Time,HomeTeam,AwayTeam,FTHG,FTAG,FTR,HTHG,HTAG,HTR," +
  "B365H,B365D,B365A,PSH,PSD,PSA,MaxH,MaxD,MaxA,AvgH,AvgD,AvgA," +
  "Avg>2.5,Avg<2.5,Max>2.5,Max<2.5," +
  "B365CH,B365CD,B365CA,MaxCH,MaxCD,MaxCA,AvgCH,AvgCD,AvgCA," +
  "AvgC>2.5,AvgC<2.5";

const BETBRAIN_HEADER =
  "Div,Date,HomeTeam,AwayTeam,FTHG,FTAG,FTR,HTHG,HTAG,HTR," +
  "B365H,B365D,B365A,BbMxH,BbMxD,BbMxA,BbAvH,BbAvD,BbAvA," +
  "BbAv>2.5,BbAv<2.5,BbMx>2.5,BbMx<2.5";

describe("csv field splitting", () => {
  it("handles quoted fields and doubled quotes", () => {
    expect(splitCsvLine('a,"b,c","d""e",')).toEqual(["a", "b,c", 'd"e', ""]);
  });
});

describe("date parsing", () => {
  it("reads both of the corpus's date formats", () => {
    expect(parseFootballDataDate("16/08/2024")).toBe("2024-08-16");
    expect(parseFootballDataDate("16/08/24")).toBe("2024-08-16");
  });

  it("windows two-digit years at 70 so the 1990s archive is not read as the 2090s", () => {
    expect(parseFootballDataDate("14/08/93")).toBe("1993-08-14");
    expect(parseFootballDataDate("14/08/69")).toBe("2069-08-14");
  });

  it("rejects a date that does not exist rather than rolling it over", () => {
    // Date.UTC(2024, 1, 31) silently becomes 2 March; the parser must not.
    expect(parseFootballDataDate("31/02/2024")).toBeNull();
    expect(parseFootballDataDate("32/01/2024")).toBeNull();
    expect(parseFootballDataDate("16-08-2024")).toBeNull();
  });
});

describe("season directory labels", () => {
  it("expands the publisher's four-digit directory", () => {
    expect(seasonLabelFromDirectory("2425")).toBe("2024/2025");
    expect(seasonLabelFromDirectory("1516")).toBe("2015/2016");
  });

  it("crosses the century boundary", () => {
    expect(seasonLabelFromDirectory("9900")).toBe("1999/2000");
  });

  it("rejects a directory whose years are not consecutive", () => {
    expect(seasonLabelFromDirectory("2426")).toBeNull();
    expect(seasonLabelFromDirectory("abc")).toBeNull();
  });
});

describe("parsing the market-average layout", () => {
  const csv = [
    MARKET_HEADER,
    "E0,16/08/2024,20:00,Man United,Fulham,1,0,H,0,0,D," +
      "1.60,4.20,5.25,1.63,4.38,5.30,1.68,4.50,5.50,1.62,4.36,5.15," +
      "1.53,2.52,1.57,2.60," +
      "1.67,4.10,5.00,1.70,4.33,5.50,1.66,4.20,5.02,1.61,2.37",
  ].join("\n");

  it("accepts the row and reads its identity and score", () => {
    const parsed = parseFootballDataCsv({
      csv,
      sourceSeason: "2425",
      expectedDivision: "E0",
    });
    expect(parsed.rejected).toEqual([]);
    expect(parsed.matches).toHaveLength(1);
    const match = parsed.matches[0]!;
    expect(match).toMatchObject({
      sourceDivision: "E0",
      seasonLabel: "2024/2025",
      kickoffDate: "2024-08-16",
      kickoffTime: "20:00",
      sourceHomeName: "Man United",
      sourceAwayName: "Fulham",
      homeGoals: 1,
      awayGoals: 0,
      halfTimeHomeGoals: 0,
      halfTimeAwayGoals: 0,
    });
  });

  it("separates pre-closing prices from closing prices", () => {
    const match = parseFootballDataCsv({
      csv,
      sourceSeason: "2425",
      expectedDivision: "E0",
    }).matches[0]!;
    const average1x2 = (phase: "PRE_CLOSING" | "CLOSING") =>
      match.quotes
        .filter(
          (quote) =>
            quote.marketCode === "FOOTBALL_FULL_TIME_1X2" &&
            quote.scope === "AVERAGE" &&
            quote.phase === phase,
        )
        .map((quote) => quote.decimalOdds);
    // The pre-closing panel average is a legitimate decision input; the
    // closing one is evaluation data, and confusing them is the leak.
    expect(average1x2("PRE_CLOSING")).toEqual(["1.62", "4.36", "5.15"]);
    expect(average1x2("CLOSING")).toEqual(["1.66", "4.20", "5.02"]);
  });

  it("reports the panel maximum separately from the panel average", () => {
    const match = parseFootballDataCsv({
      csv,
      sourceSeason: "2425",
      expectedDivision: "E0",
    }).matches[0]!;
    const maximum = match.quotes.filter(
      (quote) =>
        quote.scope === "MAXIMUM" &&
        quote.phase === "PRE_CLOSING" &&
        quote.marketCode === "FOOTBALL_FULL_TIME_1X2",
    );
    expect(maximum.map((quote) => quote.decimalOdds)).toEqual([
      "1.68",
      "4.50",
      "5.50",
    ]);
  });

  it("carries individual bookmaker prices with their own code", () => {
    const match = parseFootballDataCsv({
      csv,
      sourceSeason: "2425",
      expectedDivision: "E0",
    }).matches[0]!;
    const bookmakers = new Set(
      match.quotes
        .filter((quote) => quote.scope === "BOOKMAKER")
        .map((quote) => quote.bookmakerCode),
    );
    expect(bookmakers).toEqual(new Set(["bet365", "pinnacle"]));
  });

  it("puts the 2.5 line on the totals market and no line on 1X2", () => {
    const match = parseFootballDataCsv({
      csv,
      sourceSeason: "2425",
      expectedDivision: "E0",
    }).matches[0]!;
    const totals = match.quotes.filter(
      (quote) => quote.marketCode === "FOOTBALL_FULL_TIME_TOTAL",
    );
    expect(totals.every((quote) => quote.line === "2.5")).toBe(true);
    expect(
      match.quotes
        .filter((quote) => quote.marketCode === "FOOTBALL_FULL_TIME_1X2")
        .every((quote) => quote.line === null),
    ).toBe(true);
  });

  it("never invents a both-teams-to-score price, because the source has none", () => {
    const match = parseFootballDataCsv({
      csv,
      sourceSeason: "2425",
      expectedDivision: "E0",
    }).matches[0]!;
    expect(
      match.quotes.some(
        (quote) => quote.marketCode === "FOOTBALL_FULL_TIME_BTTS",
      ),
    ).toBe(false);
  });
});

describe("parsing the Betbrain layout", () => {
  const csv = [
    BETBRAIN_HEADER,
    "E0,08/08/2015,Bournemouth,Aston Villa,0,1,A,0,0,D," +
      "2.30,3.30,3.20,2.45,3.50,3.55,2.28,3.31,3.24," +
      "2.05,1.82,2.15,1.90",
  ].join("\n");

  it("falls back to the Betbrain aggregate columns and reports the family", () => {
    const parsed = parseFootballDataCsv({
      csv,
      sourceSeason: "1516",
      expectedDivision: "E0",
    });
    expect(parsed.oddsColumnFamily).toBe("BETBRAIN");
    expect(parsed.closingPricesAvailable).toBe(false);
    const match = parsed.matches[0]!;
    expect(match.kickoffTime).toBeNull();
    expect(
      match.quotes
        .filter(
          (quote) =>
            quote.scope === "AVERAGE" &&
            quote.marketCode === "FOOTBALL_FULL_TIME_1X2",
        )
        .map((quote) => quote.decimalOdds),
    ).toEqual(["2.28", "3.31", "3.24"]);
  });

  it("produces no closing quotes at all for a file that has none", () => {
    const parsed = parseFootballDataCsv({
      csv,
      sourceSeason: "1516",
      expectedDivision: "E0",
    });
    expect(
      parsed.matches[0]!.quotes.some((quote) => quote.phase === "CLOSING"),
    ).toBe(false);
  });
});

describe("rejections", () => {
  const row = (fields: string) =>
    parseFootballDataCsv({
      csv: [MARKET_HEADER, fields].join("\n"),
      sourceSeason: "2425",
      expectedDivision: "E0",
    });

  it("rejects a row whose division does not match the file it came from", () => {
    const parsed = row("E1,16/08/2024,20:00,A,B,1,0,H,0,0,D");
    expect(parsed.matches).toHaveLength(0);
    expect(parsed.rejected[0]?.reason).toBe("MISSING_DIVISION");
  });

  it("rejects a row whose stated result contradicts its own score", () => {
    // The failure mode this catches is column misalignment, which would
    // otherwise train the model on a shifted row without any error at all.
    const parsed = row("E0,16/08/2024,20:00,A,B,1,0,A,0,0,D");
    expect(parsed.matches).toHaveLength(0);
    expect(parsed.rejected[0]?.reason).toBe("RESULT_DISAGREES_WITH_SCORE");
  });

  it("rejects an unreadable score without rejecting an absent one", () => {
    expect(row("E0,16/08/2024,20:00,A,B,x,0,H,0,0,D").rejected[0]?.reason).toBe(
      "INVALID_SCORE",
    );
    const unplayed = row("E0,16/08/2024,20:00,A,B,,,,,,");
    expect(unplayed.rejected).toEqual([]);
    expect(unplayed.unplayed).toBe(1);
    expect(unplayed.matches).toHaveLength(0);
  });

  it("treats a trailing placeholder row as an unplayed fixture, not a defect", () => {
    // Every in-season file ends with these. Counting them as rejections would
    // make the quality report cry wolf on every download.
    const parsed = parseFootballDataCsv({
      csv: [
        MARKET_HEADER,
        "E0,16/08/2024,20:00,A,B,1,0,H,0,0,D",
        ",,,,,,,,,,",
      ].join("\n"),
      sourceSeason: "2425",
      expectedDivision: "E0",
    });
    expect(parsed.matches).toHaveLength(1);
    expect(parsed.unplayed).toBe(1);
    expect(parsed.rejected).toEqual([]);
  });

  it("drops a price at or below evens, which pays nothing back", () => {
    const parsed = parseFootballDataCsv({
      csv: [
        MARKET_HEADER,
        "E0,16/08/2024,20:00,A,B,1,0,H,0,0,D," +
          "1.60,4.20,5.25,1.63,4.38,5.30,1.68,4.50,5.50,1.00,4.36,5.15," +
          "1.53,2.52,1.57,2.60," +
          "1.67,4.10,5.00,1.70,4.33,5.50,1.66,4.20,5.02,1.61,2.37",
      ].join("\n"),
      sourceSeason: "2425",
      expectedDivision: "E0",
    });
    // One malformed member invalidates the whole aggregate group rather than
    // yielding a two-outcome "market" that would de-vig to nonsense.
    expect(
      parsed.matches[0]!.quotes.filter(
        (quote) =>
          quote.scope === "AVERAGE" &&
          quote.phase === "PRE_CLOSING" &&
          quote.marketCode === "FOOTBALL_FULL_TIME_1X2",
      ),
    ).toHaveLength(0);
  });
});

describe("outcomes derived from the score", () => {
  it("derives all three markets consistently from one scoreline", () => {
    expect(derivedOutcomes(2, 1)).toEqual({
      result: "HOME",
      totalGoals: 3,
      over2_5: true,
      bttsYes: true,
    });
    expect(derivedOutcomes(0, 0)).toEqual({
      result: "DRAW",
      totalGoals: 0,
      over2_5: false,
      bttsYes: false,
    });
    expect(derivedOutcomes(0, 3)).toEqual({
      result: "AWAY",
      totalGoals: 3,
      over2_5: true,
      bttsYes: false,
    });
    // 2-0 is over 2.5 by no reading; 1-1 is under and BTTS yes. The pair
    // exists to pin that totals and BTTS are independent of each other.
    expect(derivedOutcomes(1, 1)).toEqual({
      result: "DRAW",
      totalGoals: 2,
      over2_5: false,
      bttsYes: true,
    });
  });
});
