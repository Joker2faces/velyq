import { and, eq, isNull } from "drizzle-orm";
import {
  competitionIdentities,
  competitionProviderCoverage,
  competitions,
  providers,
  type PrivilegedVelyqDatabase,
} from "@velyq/database";
import type { ApiSportsClient } from "@velyq/providers/apisports";
import {
  fetchCurrentSeasonCoverage,
  type LeagueCoverage,
} from "@velyq/providers/apisports-lineups";
/* The canonical competition policy lives in @velyq/research, which owns it. */
import {
  API_SPORTS_COMPETITIONS,
  normalizeCompetitionName,
  resolveCanonicalCode,
} from "@velyq/research";

/**
 * Syncs API-Sports league coverage and resolves canonical competition codes,
 * in one provider request.
 *
 * Two jobs, one call, deliberately. `/leagues?current=true` returns every
 * league with its id, its country and its per-season coverage flags — which is
 * simultaneously the coverage discovery the lineup scheduler needs and the
 * authoritative name-plus-country mapping the eligibility policy needs. On a
 * plan with 100 requests a day, doing these separately would be a wasted call
 * every time.
 *
 * The identity problem this fixes is real and was blocking everything
 * downstream. The catalog keys competitions on a slug of the league *name*,
 * and a name is not an identity — "Premier League" exists in a dozen
 * countries. In production that left `canonical_code` null for 93 of 94
 * competitions, so the eligibility policy matched nothing and every real event
 * failed closed as COMPETITION_NOT_MAPPED. Resolving through the provider's own
 * league id, learned from this response, makes it unambiguous.
 */

const API_SPORTS_PROVIDER_CODE = "API_SPORTS";

export type CoverageSyncResult = Readonly<{
  provider: "API_SPORTS";
  requests: number;
  leaguesReturned: number;
  coverageRows: number;
  identityRows: number;
  /** Competitions whose canonical code this run was able to fill in. */
  competitionsResolved: number;
  /** Leagues that mapped to a canonical code, with their coverage flags. */
  resolved: readonly Readonly<{
    canonicalCode: string;
    providerLeagueId: string;
    leagueName: string;
    countryCode: string | null;
    lineups: boolean;
    odds: boolean;
  }>[];
  quotaState: string;
  requestsRemaining: number | null;
}>;

/**
 * Matches one provider league onto a canonical competition code.
 *
 * Name *and* country, never name alone. The provider's `/leagues` response
 * carries the country, which is exactly the field the ambiguity needs and
 * exactly the field a fixture response does not have — which is why this
 * mapping is built here and stored, rather than attempted per fixture.
 */
export function resolveLeague(coverage: LeagueCoverage): string | null {
  const normalized = normalizeCompetitionName(coverage.leagueName);
  const byName = API_SPORTS_COMPETITIONS.filter(
    (entry) => entry.name === normalized,
  );
  if (byName.length === 0) return null;
  /*
   * The provider's `code` is a two-letter country code for national leagues
   * and absent for continental ones, where the country name is the
   * confederation. Both are checked, and a league that matches a name but no
   * country resolves to nothing rather than to a guess.
   */
  const candidates = [
    coverage.countryCode?.toUpperCase(),
    coverage.countryName?.toUpperCase() === "WORLD" ? "EU" : null,
    /(uefa|europe)/i.test(coverage.countryName ?? "") ? "EU" : null,
  ].filter((value): value is string => Boolean(value));
  const resolution = candidates
    .map((countryCode) =>
      resolveCanonicalCode({
        sourceCode: "API_SPORTS",
        sourceKey: coverage.leagueName,
        countryCode,
      }),
    )
    .find((entry) => entry.ok);
  return resolution?.ok ? resolution.canonicalCode : null;
}

export async function syncApiSportsCoverage(
  options: Readonly<{
    database: PrivilegedVelyqDatabase;
    client: ApiSportsClient;
    asOf: Date;
  }>,
): Promise<CoverageSyncResult> {
  const [provider] = await options.database
    .select({ id: providers.id })
    .from(providers)
    .where(eq(providers.code, API_SPORTS_PROVIDER_CODE))
    .limit(1);
  if (!provider) throw new Error("API_SPORTS_PROVIDER_NOT_REGISTERED");

  const fetched = await fetchCurrentSeasonCoverage(options.client);
  /*
   * Current seasons only. A league's coverage for a season that finished two
   * years ago says nothing about whether today's fixture will have a lineup,
   * and storing every historical season would make the table mostly noise.
   */
  const current = fetched.coverage.filter((entry) => entry.current);

  let coverageRows = 0;
  let identityRows = 0;
  const resolved: CoverageSyncResult["resolved"][number][] = [];

  for (const entry of current) {
    const inserted = await options.database
      .insert(competitionProviderCoverage)
      .values({
        providerId: provider.id,
        providerLeagueId: entry.providerLeagueId,
        leagueName: entry.leagueName,
        countryName: entry.countryName,
        countryCode: entry.countryCode?.slice(0, 2) ?? null,
        season: entry.season,
        isCurrent: entry.current,
        lineups: entry.lineups,
        odds: entry.odds,
        predictions: entry.predictions,
        injuries: entry.injuries,
        statistics: entry.statistics,
        observedAt: options.asOf,
      })
      .onConflictDoUpdate({
        target: [
          competitionProviderCoverage.providerId,
          competitionProviderCoverage.providerLeagueId,
          competitionProviderCoverage.season,
        ],
        /*
         * Coverage is a current fact about the provider rather than an
         * append-only observation, so a later sync updates it. The flags do
         * change: a league gains lineup coverage mid-season and the scheduler
         * has to notice.
         */
        set: {
          lineups: entry.lineups,
          odds: entry.odds,
          predictions: entry.predictions,
          injuries: entry.injuries,
          statistics: entry.statistics,
          isCurrent: entry.current,
          observedAt: options.asOf,
        },
      })
      .returning({ id: competitionProviderCoverage.id });
    coverageRows += inserted.length;

    const canonicalCode = resolveLeague(entry);
    if (canonicalCode === null) continue;
    resolved.push({
      canonicalCode,
      providerLeagueId: entry.providerLeagueId,
      leagueName: entry.leagueName,
      countryCode: entry.countryCode,
      lineups: entry.lineups,
      odds: entry.odds,
    });

    const identity = await options.database
      .insert(competitionIdentities)
      .values({
        canonicalCode,
        sourceCode: API_SPORTS_PROVIDER_CODE,
        /* Keyed by league id: the one field that is unambiguous. */
        sourceKey: entry.providerLeagueId,
        sourceName: entry.leagueName,
        countryCode: entry.countryCode?.slice(0, 2) ?? null,
      })
      .onConflictDoNothing()
      .returning({ id: competitionIdentities.id });
    identityRows += identity.length;
  }

  /*
   * Backfill the canonical code onto competitions already in the catalog.
   *
   * Existing rows were keyed by a slug of the league name before the league
   * id was carried, so they cannot be matched by id. Matching by the same
   * slug the ingester generates is exact for those rows — and is applied only
   * where `canonical_code` is still null, so it can never overwrite an
   * identity a later id-keyed ingestion established.
   */
  let competitionsResolved = 0;
  for (const entry of resolved) {
    const slug = entry.leagueName
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const updated = await options.database
      .update(competitions)
      .set({
        canonicalCode: entry.canonicalCode,
        ...(entry.countryCode
          ? { countryCode: entry.countryCode.slice(0, 2) }
          : {}),
      })
      .where(
        and(eq(competitions.code, slug), isNull(competitions.canonicalCode)),
      )
      .returning({ id: competitions.id });
    competitionsResolved += updated.length;
  }

  return {
    provider: "API_SPORTS",
    requests: fetched.requests,
    leaguesReturned: fetched.coverage.length,
    coverageRows,
    identityRows,
    competitionsResolved,
    resolved,
    quotaState: fetched.quota.state,
    requestsRemaining: fetched.quota.requestsRemaining,
  };
}
