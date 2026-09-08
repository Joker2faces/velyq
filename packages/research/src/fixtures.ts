import type {
  HistoricalQuote,
  RejectedRow,
  RejectionReason,
} from "./corpus.js";
import { csvRows, parseFootballDataDate, quotesFor } from "./football-data.js";

/**
 * The upcoming-fixtures feed, which is what makes a real pre-event prediction
 * possible from this publisher at all.
 *
 * The season archives contain played matches only — a current-season file ends
 * at the last result — so nothing in them can be predicted. `fixtures.csv` is
 * the next few days of *unplayed* fixtures with the panel's pre-event prices
 * already attached, in the same column names the archives use. Same publisher,
 * so the same team spellings the model was trained on: no cross-provider name
 * mapping stands between a fixture and its ratings.
 *
 * Rows carry no result columns, which is the point — a row here with a score
 * would mean the feed had gone stale and is rejected rather than ingested.
 */

export type UpcomingFixture = Readonly<{
  sourceDivision: string;
  /** `YYYY-MM-DD` in the publisher's own (UK) reckoning. */
  kickoffDate: string;
  /** `HH:MM`; the feed always carries it. */
  kickoffTime: string | null;
  sourceHomeName: string;
  sourceAwayName: string;
  /**
   * Every price the feed carries for this fixture: individual bookmakers plus
   * the panel average and maximum, all PRE_CLOSING by construction.
   */
  quotes: readonly HistoricalQuote[];
}>;

export type ParsedFixturesFeed = Readonly<{
  fixtures: readonly UpcomingFixture[];
  rejected: readonly RejectedRow[];
  /** Divisions seen in the feed, whether or not they are mapped. */
  divisions: readonly string[];
}>;

export function parseFootballDataFixtures(csv: string): ParsedFixturesFeed {
  const { rows } = csvRows(csv);
  const fixtures: UpcomingFixture[] = [];
  const rejected: RejectedRow[] = [];
  const divisions = new Set<string>();
  const reject = (
    lineNumber: number,
    reason: RejectionReason,
    detail: string,
  ) => rejected.push({ lineNumber, reason, detail });

  rows.forEach((row, index) => {
    const lineNumber = index + 2;
    const division = (row.get("Div") ?? "").trim();
    const home = (row.get("HomeTeam") ?? "").trim();
    const away = (row.get("AwayTeam") ?? "").trim();
    if (division === "" && home === "" && away === "") return;
    if (division === "") {
      reject(lineNumber, "MISSING_DIVISION", "no Div value");
      return;
    }
    divisions.add(division);
    if (home === "" || away === "") {
      reject(lineNumber, "MISSING_TEAM", `home=${home} away=${away}`);
      return;
    }
    const rawDate = (row.get("Date") ?? "").trim();
    const kickoffDate = parseFootballDataDate(rawDate);
    if (kickoffDate === null) {
      reject(
        lineNumber,
        rawDate === "" ? "MISSING_DATE" : "INVALID_DATE",
        `${home} v ${away} date=${rawDate}`,
      );
      return;
    }
    /*
     * A fixtures row must not have a result. If it does, this file is the
     * wrong file — a season archive saved under the fixtures name — and
     * ingesting it would write finished matches into the catalog as upcoming
     * events.
     */
    if ((row.get("FTHG") ?? "").trim() !== "") {
      reject(
        lineNumber,
        "RESULT_DISAGREES_WITH_SCORE",
        `${home} v ${away} already has a full-time score`,
      );
      return;
    }
    const time = (row.get("Time") ?? "").trim();
    fixtures.push({
      sourceDivision: division,
      kickoffDate,
      kickoffTime: /^\d{1,2}:\d{2}$/.test(time) ? time.padStart(5, "0") : null,
      sourceHomeName: home,
      sourceAwayName: away,
      /*
       * The feed has no closing columns, so every quote comes back
       * PRE_CLOSING. Filtered anyway rather than assumed: a price labelled
       * CLOSING reaching a live decision would be the leak this whole
       * distinction exists to prevent, and the filter costs nothing.
       */
      quotes: quotesFor(row).filter((quote) => quote.phase === "PRE_CLOSING"),
    });
  });

  return {
    fixtures,
    rejected,
    divisions: [...divisions].sort(),
  };
}

/**
 * Combines the publisher's UK-local date and time into an instant.
 *
 * The feed publishes `dd/mm/yyyy` and `HH:MM` with no zone. Kickoff times are
 * UK local, so early September is BST — an hour ahead of UTC. Treating them as
 * UTC would place every fixture an hour late, which for a horizon filter and a
 * pre-kickoff cutoff is exactly the wrong direction: it would let a match that
 * has already started still look upcoming.
 *
 * `offsetMinutes` is passed in rather than computed from a timezone database,
 * because a whole IANA implementation for one publisher's single convention is
 * not worth the dependency and the caller knows the season.
 */
export function fixtureInstant(
  fixture: UpcomingFixture,
  offsetMinutes: number,
): string {
  const time = fixture.kickoffTime ?? "12:00";
  const [hourText, minuteText] = time.split(":");
  const base = Date.parse(`${fixture.kickoffDate}T00:00:00Z`);
  const minutes =
    Number(hourText ?? "12") * 60 + Number(minuteText ?? "0") - offsetMinutes;
  return new Date(base + minutes * 60_000).toISOString();
}

/**
 * The UK's UTC offset in minutes for a given instant.
 *
 * British Summer Time runs from the last Sunday in March to the last Sunday in
 * October, both at 01:00 UTC. Implemented directly rather than pulled from a
 * timezone library: it is one rule, it has not changed since 1996, and it is
 * verifiable by reading it.
 */
export function unitedKingdomOffsetMinutes(instant: Date): number {
  const year = instant.getUTCFullYear();
  const lastSunday = (month: number) => {
    const lastDay = new Date(Date.UTC(year, month + 1, 0));
    return Date.UTC(
      year,
      month,
      lastDay.getUTCDate() - lastDay.getUTCDay(),
      1,
      0,
      0,
    );
  };
  const time = instant.getTime();
  return time >= lastSunday(2) && time < lastSunday(9) ? 60 : 0;
}
