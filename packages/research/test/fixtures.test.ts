import { describe, expect, it } from "vitest";
import {
  decodeSourceBytes,
  fixtureInstant,
  parseFootballDataFixtures,
  unitedKingdomOffsetMinutes,
} from "../src/index.js";

/*
 * A trimmed version of the real fixtures feed. It has the same price columns
 * as a season archive and, crucially, no result columns — that absence is what
 * makes a row a fixture rather than a match.
 */
const HEADER =
  "Div,Date,Time,HomeTeam,AwayTeam,Referee," +
  "B365H,B365D,B365A,BWH,BWD,BWA,PPH,PPD,PPA,SKBH,SKBD,SKBA," +
  "MaxH,MaxD,MaxA,AvgH,AvgD,AvgA,BFEH,BFED,BFEA," +
  "B365>2.5,B365<2.5,Max>2.5,Max<2.5,Avg>2.5,Avg<2.5,BFE>2.5,BFE<2.5";

const ROW =
  "I1,07/09/2026,17:30,Cagliari,Lecce,," +
  "2.10,3.40,3.60,2.05,3.45,3.70,2.10,3.30,3.55,2.08,3.40,3.65," +
  "2.15,3.50,3.80,2.09,3.41,3.65,2.18,3.55,3.85," +
  "2.30,1.65,2.40,1.70,2.32,1.66,2.42,1.72";

function feed(...rows: readonly string[]) {
  return parseFootballDataFixtures([HEADER, ...rows].join("\n"));
}

describe("the upcoming-fixtures feed", () => {
  it("reads a fixture and its division", () => {
    const parsed = feed(ROW);
    expect(parsed.rejected).toEqual([]);
    expect(parsed.divisions).toEqual(["I1"]);
    expect(parsed.fixtures[0]).toMatchObject({
      sourceDivision: "I1",
      kickoffDate: "2026-09-07",
      kickoffTime: "17:30",
      sourceHomeName: "Cagliari",
      sourceAwayName: "Lecce",
    });
  });

  it("carries every individual bookmaker price for the match result", () => {
    // Bookmaker coverage is an eligibility gate, so this count is not
    // cosmetic: it is the difference between a market that can reach a
    // decision and one that cannot.
    const quotes = feed(ROW).fixtures[0]!.quotes;
    const books = new Set(
      quotes
        .filter(
          (quote) =>
            quote.scope === "BOOKMAKER" &&
            quote.marketCode === "FOOTBALL_FULL_TIME_1X2",
        )
        .map((quote) => quote.bookmakerCode),
    );
    expect(books).toEqual(
      new Set([
        "bet365",
        "bet-and-win",
        "paddy-power",
        "skybet",
        "betfair-exchange",
      ]),
    );
  });

  it("carries far fewer books for totals, which is the source's real shape", () => {
    // The publisher lists seven books for 1X2 and two or three for totals, so
    // the totals market legitimately clears a lower bar of evidence on the
    // same fixture. Pretending otherwise would mean inventing coverage.
    const quotes = feed(ROW).fixtures[0]!.quotes;
    const books = new Set(
      quotes
        .filter(
          (quote) =>
            quote.scope === "BOOKMAKER" &&
            quote.marketCode === "FOOTBALL_FULL_TIME_TOTAL",
        )
        .map((quote) => quote.bookmakerCode),
    );
    expect(books).toEqual(new Set(["bet365", "betfair-exchange"]));
  });

  it("labels every price pre-closing, because the feed has no closing columns", () => {
    // A price labelled CLOSING reaching a live decision would be the leak the
    // whole phase distinction exists to prevent.
    expect(
      feed(ROW).fixtures[0]!.quotes.every(
        (quote) => quote.phase === "PRE_CLOSING",
      ),
    ).toBe(true);
  });

  it("rejects a row that already has a result", () => {
    // That means the wrong file was saved under the fixtures name, and
    // ingesting it would write finished matches into the catalog as upcoming
    // events.
    const withResult = parseFootballDataFixtures(
      [`${HEADER},FTHG,FTAG`, `${ROW},1,0`].join("\n"),
    );
    expect(withResult.fixtures).toHaveLength(0);
    expect(withResult.rejected[0]?.reason).toBe("RESULT_DISAGREES_WITH_SCORE");
  });

  it("rejects a row with no readable date", () => {
    expect(
      feed("I1,tomorrow,17:30,Cagliari,Lecce,,,,,,,,,,,,,,,,,,,,,,,,,,,,,")
        .rejected[0]?.reason,
    ).toBe("INVALID_DATE");
  });

  it("reports unmapped divisions rather than dropping them silently", () => {
    const parsed = feed(ROW, ROW.replace("I1,", "SC2,"));
    expect(parsed.divisions).toEqual(["I1", "SC2"]);
    expect(parsed.fixtures).toHaveLength(2);
  });
});

describe("kickoff instants", () => {
  it("treats the feed's times as UK local, not UTC", () => {
    /*
     * The feed publishes a date and time with no zone. Reading them as UTC
     * places every fixture an hour late through British Summer Time, and for
     * a "has this kicked off yet" test that is the wrong direction — it lets
     * a match already under way still look upcoming and become a candidate
     * for a pre-event prediction.
     */
    const fixture = feed(ROW).fixtures[0]!;
    expect(fixtureInstant(fixture, 60)).toBe("2026-09-07T16:30:00.000Z");
    expect(fixtureInstant(fixture, 0)).toBe("2026-09-07T17:30:00.000Z");
  });

  it("falls back to midday for a fixture with no published time", () => {
    const fixture = { ...feed(ROW).fixtures[0]!, kickoffTime: null };
    expect(fixtureInstant(fixture, 60)).toBe("2026-09-07T11:00:00.000Z");
  });

  it("knows when British Summer Time applies", () => {
    // Last Sunday in March to last Sunday in October, both at 01:00 UTC.
    expect(unitedKingdomOffsetMinutes(new Date("2026-09-07T12:00:00Z"))).toBe(
      60,
    );
    expect(unitedKingdomOffsetMinutes(new Date("2026-01-15T12:00:00Z"))).toBe(
      0,
    );
    expect(unitedKingdomOffsetMinutes(new Date("2026-12-15T12:00:00Z"))).toBe(
      0,
    );
    // 2026: BST starts 29 March, ends 25 October.
    expect(unitedKingdomOffsetMinutes(new Date("2026-03-29T00:30:00Z"))).toBe(
      0,
    );
    expect(unitedKingdomOffsetMinutes(new Date("2026-03-29T01:30:00Z"))).toBe(
      60,
    );
    expect(unitedKingdomOffsetMinutes(new Date("2026-10-25T00:30:00Z"))).toBe(
      60,
    );
    expect(unitedKingdomOffsetMinutes(new Date("2026-10-25T01:30:00Z"))).toBe(
      0,
    );
  });
});

describe("source decoding", () => {
  it("strips a UTF-8 byte-order mark so the first column name is readable", () => {
    // Left in place the BOM becomes part of `Div`, every division lookup
    // misses, and the whole feed parses as rows with no division.
    const bytes = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from(HEADER, "utf8"),
    ]);
    expect(decodeSourceBytes(bytes).startsWith("Div,")).toBe(true);
  });

  it("decodes Windows-1252 names rather than replacing them", () => {
    // Team identity is a normalized name, so a replacement character quietly
    // splits one club into two and halves both halves' ratings.
    expect(decodeSourceBytes(Buffer.from([0x4e, 0xee, 0x6d, 0x65, 0x73]))).toBe(
      "Nîmes",
    );
  });
});
