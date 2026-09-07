import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_MIN_HISTORICAL_SAMPLE,
  FOOTBALL_DATA_DIVISIONS,
  FOOTBALL_DATA_UK,
  competitionPolicy,
} from "../../packages/research/src/index.js";
import {
  decodeSourceFile,
  loadCorpus,
  parseCorpusFileName,
} from "../scripts/historical-corpus.js";
import { seasonRange } from "../scripts/historical-download.js";

const CORPUS_DIRECTORY =
  process.env["VELYQ_HISTORICAL_CORPUS_DIR"] ?? "data/historical/football-data";

function corpusPresent() {
  return (
    existsSync(CORPUS_DIRECTORY) &&
    readdirSync(CORPUS_DIRECTORY).some((name) =>
      /^\d{4}_[A-Z0-9]+\.csv$/.test(name),
    )
  );
}

describe("corpus file naming", () => {
  it("reads season and division out of the filename", () => {
    expect(parseCorpusFileName("2425_E0.csv")).toEqual({
      sourceSeason: "2425",
      sourceDivision: "E0",
    });
    expect(parseCorpusFileName("1516_SP1.csv")).toEqual({
      sourceSeason: "1516",
      sourceDivision: "SP1",
    });
  });

  it("ignores files that are not season archives", () => {
    // `fixtures.csv` lives in the same directory and holds *unplayed*
    // fixtures. Reading it as a season archive would put matches with no
    // result into the training set.
    expect(parseCorpusFileName("fixtures.csv")).toBeNull();
    expect(parseCorpusFileName("notes.txt")).toBeNull();
    expect(parseCorpusFileName("2426_E0.csv")).toBeNull();
  });
});

describe("source file decoding", () => {
  it("strips a UTF-8 BOM so the first column name is readable", () => {
    // Without this the first column name still carries the BOM, every row's
    // division lookup misses, and a current-season file yields zero matches.
    const bytes = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from("Div,Date", "utf8"),
    ]);
    expect(decodeSourceFile(bytes)).toBe("Div,Date");
  });

  it("decodes Windows-1252 team names rather than mangling them", () => {
    // Reading these as UTF-8 produces a replacement character, and since team
    // identity is a normalized name, that silently splits one club into two.
    expect(decodeSourceFile(Buffer.from([0x4e, 0xee, 0x6d, 0x65, 0x73]))).toBe(
      "Nîmes",
    );
    // 0x92 is a curly apostrophe in Windows-1252 and undefined in Latin-1,
    // which is why the decoder names the former.
    expect(
      decodeSourceFile(Buffer.from([0x4e, 0x6f, 0x74, 0x74, 0x92, 0x6d])),
    ).toBe("Nott’m");
  });
});

describe("season ranges", () => {
  it("expands to the publisher's directory names", () => {
    expect(seasonRange("1516", "1819")).toEqual([
      "1516",
      "1617",
      "1718",
      "1819",
    ]);
  });

  it("crosses the century boundary", () => {
    expect(seasonRange("9899", "0001")).toContain("9900");
  });
});

describe("provenance", () => {
  it("records that the publisher's terms still need the owner to look", () => {
    // Internal model training and public redistribution are separate
    // questions. This flag answers neither on its own; it records that one is
    // open, which is why the files are gitignored and never served.
    expect(FOOTBALL_DATA_UK.termsReview).toBe("NEEDS_OWNER_REVIEW");
    expect(FOOTBALL_DATA_UK.termsNote).toMatch(/no licence|no explicit/i);
    expect(FOOTBALL_DATA_UK.schemaNotesUrl).toMatch(/notes\.txt$/);
    expect(FOOTBALL_DATA_UK.preEventPricesAvailable).toBe(true);
  });
});

/*
 * These run against the real downloaded corpus. It is gitignored — the
 * publisher grants no redistribution — so they skip rather than fail where it
 * is absent, and `pnpm data:historical:download` makes them run.
 */
describe.skipIf(!corpusPresent())("the downloaded corpus", () => {
  const corpus = loadCorpus(CORPUS_DIRECTORY);

  it("parses every file it recognises with no rejected rows", () => {
    // A non-zero rejection count is not automatically a bug, but it must be
    // explained before a model is fitted, so it is pinned at zero here and
    // any future drift shows up as a failing test rather than a silent loss.
    expect(corpus.quality.files).toBeGreaterThan(0);
    expect(corpus.quality.rowsRejected).toBe(0);
    expect(corpus.quality.rejectionsByReason).toEqual({});
  });

  it("contains no duplicated match", () => {
    expect(corpus.quality.duplicates).toEqual([]);
  });

  it("covers every division in the initial universe", () => {
    const covered = new Set(
      corpus.quality.competitions.map(
        (competition) => competition.canonicalCompetitionCode,
      ),
    );
    for (const canonicalCode of Object.values(FOOTBALL_DATA_DIVISIONS))
      expect(covered).toContain(canonicalCode);
  });

  it("has enough history behind every competition to satisfy its own policy", () => {
    for (const competition of corpus.quality.competitions) {
      const policy = competitionPolicy(competition.canonicalCompetitionCode);
      expect(policy).not.toBeNull();
      expect(competition.matches).toBeGreaterThanOrEqual(
        policy?.minHistoricalSample ?? DEFAULT_MIN_HISTORICAL_SAMPLE,
      );
      // A competition needs enough teams for attack and defence to be
      // identified at all, not just enough matches.
      expect(competition.teams).toBeGreaterThanOrEqual(18);
    }
  });

  it("carries a pre-closing panel average for effectively every match", () => {
    // This is the decision input. If it were sparse, the market baseline and
    // the live consensus would both be resting on a small subset without
    // saying so.
    for (const competition of corpus.quality.competitions)
      expect(
        competition.matchesWith1x2Average / competition.matches,
      ).toBeGreaterThan(0.99);
  });

  it("reports closing prices as available only for the seasons that have them", () => {
    // Football-Data replaced its Betbrain columns from 2019/20 and only the
    // later family carries closing prices, so a corpus reaching back further
    // must show both families and a positive count of files without closing
    // prices — otherwise the parser is inventing one of them.
    expect(corpus.quality.oddsColumnFamilies["BETBRAIN"]).toBeGreaterThan(0);
    expect(corpus.quality.oddsColumnFamilies["MARKET_AVERAGE"]).toBeGreaterThan(
      0,
    );
    expect(corpus.quality.filesWithoutClosingPrices).toBe(
      corpus.quality.oddsColumnFamilies["BETBRAIN"],
    );
  });

  it("never puts a closing price into the training rows' decision inputs", () => {
    // The single most important property of the corpus loader. A closing
    // price used to make a historical decision is looking at the answer.
    for (const match of corpus.matches.slice(0, 500)) {
      const odds = match.preClosingAverageOdds;
      if (odds.FOOTBALL_FULL_TIME_1X2)
        expect(odds.FOOTBALL_FULL_TIME_1X2).toHaveLength(3);
      if (odds.FOOTBALL_FULL_TIME_TOTAL)
        expect(odds.FOOTBALL_FULL_TIME_TOTAL).toHaveLength(2);
      // The source publishes no both-teams-to-score price at all.
      expect(odds.FOOTBALL_FULL_TIME_BTTS).toBeUndefined();
    }
  });

  it("keeps every file's checksum, so a corrected re-release is a new import", () => {
    for (const file of corpus.files) {
      expect(file.contentSha256).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(file.byteLength).toBeGreaterThan(0);
      expect(path.extname(file.fileName)).toBe(".csv");
    }
  });
});
