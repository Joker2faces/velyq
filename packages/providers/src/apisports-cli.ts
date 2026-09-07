import {
  createApiSportsClient,
  normalizeBasketballGame,
  normalizeFootballFixture,
  sanitizeProviderError,
} from "./apisports.js";

const args = new Map<string, string>();
for (let index = 2; index < process.argv.length; index += 1) {
  const key = process.argv[index];
  const value = process.argv[index + 1];
  if (key?.startsWith("--") && value && !value.startsWith("--"))
    args.set(key.slice(2), value);
}
const sport = args.get("sport") === "basketball" ? "basketball" : "football";
const date = args.get("date") ?? new Date().toISOString().slice(0, 10);
const client = createApiSportsClient(sport);
try {
  const fixturePath = sport === "football" ? "/fixtures" : "/games";
  const fixtureResponse = await client.get(fixturePath, { date });
  const records = fixtureResponse.body.response ?? [];
  const normalized: readonly unknown[] = records.slice(0, 25).map((record) => {
    try {
      return sport === "football"
        ? normalizeFootballFixture(record)
        : normalizeBasketballGame(record);
    } catch (error) {
      return { error: sanitizeProviderError(error) };
    }
  });
  console.log(
    JSON.stringify(
      {
        provider: "API_SPORTS",
        sport: sport.toUpperCase(),
        endpoint: fixturePath,
        status: fixtureResponse.status,
        results: fixtureResponse.body.results ?? records.length,
        pages: fixtureResponse.body.paging?.total ?? 1,
        quota: fixtureResponse.quota,
        normalizedRecords: normalized,
        fetchedAt: new Date().toISOString(),
        dryRun: process.env["DRY_RUN"] !== "false",
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.log(
    JSON.stringify(
      {
        provider: "API_SPORTS",
        sport: sport.toUpperCase(),
        endpoint: sport === "football" ? "/fixtures" : "/games",
        status: "FAILED",
        error: sanitizeProviderError(error),
        dryRun: process.env["DRY_RUN"] !== "false",
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
}
