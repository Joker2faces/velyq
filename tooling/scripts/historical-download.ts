import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  FOOTBALL_DATA_DIVISIONS,
  FOOTBALL_DATA_UK,
} from "../../packages/research/src/index.js";

/**
 * Downloads the historical training corpus and the upcoming-fixtures feed.
 *
 * The files land in a gitignored directory and are never committed:
 * Football-Data.co.uk publishes no explicit redistribution licence, so only
 * their provenance, their checksums and the model parameters derived from them
 * are versioned. See `FOOTBALL_DATA_UK.termsNote`.
 *
 * Two endpoints, two purposes:
 *
 * - `mmz4281/<season>/<division>.csv` is the season archive: results plus
 *   pre-closing and closing prices. Training data.
 * - `fixtures.csv` is the next few days of *unplayed* fixtures with
 *   pre-closing prices already attached. Live decision input — the season
 *   archives contain played matches only, so this is the file that makes a
 *   real pre-event prediction possible from this source at all.
 *
 * Usage:
 *   pnpm data:historical:download
 *   pnpm data:historical:download --from 1920 --to 2627
 *   pnpm data:historical:download --fixtures-only
 */

const BASE_URL = "https://football-data.co.uk";

/*
 * `www.football-data.co.uk` currently answers 503 from its edge while the
 * apex host serves the same files over TLS, and plain HTTP redirects to the
 * apex anyway. Requesting the apex over HTTPS directly is both the working
 * and the correct choice.
 */
const USER_AGENT = "VELYQ-research/1.0 (+https://velyq.dev)";

/**
 * Expands an inclusive range of the publisher's season directories.
 *
 * The directories are two-digit, so the range has to be walked in full years
 * or it breaks across 1999/2000: iterating the raw digits from `9899` to
 * `0001` counts from 98 down to 0 and yields nothing at all. Two-digit years
 * are windowed at 70, the same rule the corpus parser uses, because the
 * publisher's archive reaches back to 1993.
 */
export function seasonRange(from: string, to: string): readonly string[] {
  const fullYear = (directory: string) => {
    const twoDigit = Number(directory.slice(0, 2));
    return twoDigit >= 70 ? 1900 + twoDigit : 2000 + twoDigit;
  };
  const startYear = fullYear(from);
  const endYear = fullYear(to);
  const seasons: string[] = [];
  for (let year = startYear; year <= endYear; year += 1) {
    const start = year % 100;
    const end = (year + 1) % 100;
    seasons.push(
      `${String(start).padStart(2, "0")}${String(end).padStart(2, "0")}`,
    );
  }
  return seasons;
}

export type DownloadedFile = Readonly<{
  target: string;
  sourceUri: string;
  status: number;
  byteLength: number;
}>;

async function fetchText(
  sourceUri: string,
): Promise<Readonly<{ status: number; body: Buffer }>> {
  const response = await fetch(sourceUri, {
    headers: { "user-agent": USER_AGENT },
    redirect: "follow",
  });
  const body = Buffer.from(await response.arrayBuffer());
  return { status: response.status, body };
}

export async function downloadCorpus(
  options: Readonly<{
    directory: string;
    seasons: readonly string[];
    divisions: readonly string[];
    fixturesOnly: boolean;
  }>,
): Promise<
  Readonly<{
    downloaded: readonly DownloadedFile[];
    missing: readonly DownloadedFile[];
  }>
> {
  mkdirSync(options.directory, { recursive: true });
  const downloaded: DownloadedFile[] = [];
  const missing: DownloadedFile[] = [];

  const save = async (sourceUri: string, target: string) => {
    const result = await fetchText(sourceUri);
    const record = {
      target,
      sourceUri,
      status: result.status,
      byteLength: result.body.byteLength,
    };
    if (result.status !== 200 || result.body.byteLength === 0) {
      missing.push(record);
      return;
    }
    writeFileSync(path.join(options.directory, target), result.body);
    downloaded.push(record);
  };

  if (!options.fixturesOnly)
    for (const season of options.seasons)
      for (const division of options.divisions)
        await save(
          `${BASE_URL}/mmz4281/${season}/${division}.csv`,
          `${season}_${division}.csv`,
        );

  // Kept out of the season-named set on purpose: it is not a season archive
  // and `loadCorpus` must never read unplayed fixtures as training rows.
  await save(`${BASE_URL}/fixtures.csv`, "fixtures.csv");
  // The publisher's own column documentation, saved alongside the data so the
  // schema interpretation this importer relies on is recorded at import time
  // rather than assumed from memory later.
  await save(`${BASE_URL}/notes.txt`, "notes.txt");

  return { downloaded, missing };
}

function stringArgument(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  const value = process.argv[index + 1];
  return index === -1 || value === undefined || value.startsWith("--")
    ? fallback
    : value;
}

async function main() {
  const directory =
    process.env["VELYQ_HISTORICAL_CORPUS_DIR"] ??
    "data/historical/football-data";
  const result = await downloadCorpus({
    directory,
    seasons: seasonRange(
      stringArgument("from", "1516"),
      stringArgument("to", "2627"),
    ),
    divisions: Object.keys(FOOTBALL_DATA_DIVISIONS),
    fixturesOnly: process.argv.includes("--fixtures-only"),
  });
  process.stdout.write(
    `${JSON.stringify(
      {
        source: FOOTBALL_DATA_UK.code,
        sourceUrl: FOOTBALL_DATA_UK.sourceUrl,
        termsReview: FOOTBALL_DATA_UK.termsReview,
        directory,
        downloaded: result.downloaded.length,
        bytes: result.downloaded.reduce(
          (sum, file) => sum + file.byteLength,
          0,
        ),
        missing: result.missing.map((file) => ({
          target: file.target,
          status: file.status,
        })),
      },
      null,
      2,
    )}\n`,
  );
}

if (process.argv[1]?.endsWith("historical-download.ts")) void main();
