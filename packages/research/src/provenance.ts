/**
 * Where historical training data came from, recorded per row rather than
 * assumed.
 *
 * VELYQ's operational feed is API-Sports. The training corpus is not: it comes
 * from a separate publisher with a different schema, different team names,
 * different bookmaker set and different collection times. Conflating the two
 * would make every downstream claim about "our data" untraceable, so source
 * identity travels with the data all the way into the database.
 */

export type HistoricalSourceCode = "FOOTBALL_DATA_UK";

export type TermsReviewStatus = "PASS" | "NEEDS_OWNER_REVIEW";

export type HistoricalSource = Readonly<{
  code: HistoricalSourceCode;
  displayName: string;
  /** The page a human should read, not the file endpoint. */
  sourceUrl: string;
  /** What the publisher documents about the columns this importer reads. */
  schemaNotesUrl: string;
  /**
   * Whether the publisher's own terms are explicit enough to act on without
   * the owner deciding. Internal model training and public redistribution are
   * separate questions and this flag answers neither on its own — it says
   * only that a human still has to look.
   */
  termsReview: TermsReviewStatus;
  termsNote: string;
  /**
   * Whether the odds columns this importer reads are observed before kickoff.
   * A source whose only prices are post-match is evaluation data, never
   * decision input.
   */
  preEventPricesAvailable: boolean;
}>;

export const FOOTBALL_DATA_UK: HistoricalSource = Object.freeze({
  code: "FOOTBALL_DATA_UK",
  displayName: "Football-Data.co.uk",
  sourceUrl: "https://football-data.co.uk/",
  schemaNotesUrl: "https://football-data.co.uk/notes.txt",
  termsReview: "NEEDS_OWNER_REVIEW",
  termsNote:
    "notes.txt documents the column schema and credits its own upstream " +
    "sources (XScores for results; Betbrain, Oddsportal and individual " +
    "bookmakers for prices) but states no licence and grants no explicit " +
    "redistribution permission. Internal model training is treated as in " +
    "scope; publishing the dataset through VELYQ is not, and needs the owner " +
    "to decide. The files are therefore never committed to the repository " +
    "and never served to customers — only model parameters derived from them.",
  preEventPricesAvailable: true,
});

export const HISTORICAL_SOURCES: Readonly<
  Record<HistoricalSourceCode, HistoricalSource>
> = Object.freeze({ FOOTBALL_DATA_UK });

/**
 * One import of one file, identified by content rather than by filename so a
 * re-download of changed data is a new import and a re-download of unchanged
 * data is not.
 */
export type ImportProvenance = Readonly<{
  sourceCode: HistoricalSourceCode;
  importVersion: string;
  sourceUri: string;
  contentSha256: string;
  downloadedAt: string;
  /**
   * Which odds column family the file actually used. Football-Data replaced
   * its Betbrain columns (`BbAvH`, `BbAv>2.5`) with market Avg/Max columns
   * (`AvgH`, `Avg>2.5`) from 2019/20, and only the later family carries
   * closing prices. Recording it keeps a backtest honest about which seasons
   * could have had a closing-line comparison at all.
   */
  oddsColumnFamily: "BETBRAIN" | "MARKET_AVERAGE" | "NONE";
}>;

export const IMPORT_VERSION = "football-data.v1" as const;
