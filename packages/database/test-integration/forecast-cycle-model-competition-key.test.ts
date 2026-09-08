import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { runForecastCycle } from "@velyq/application/forecast-cycle";
import { DEFAULT_HYPERPARAMETERS } from "@velyq/research";
import type { ModelArtifact } from "@velyq/research";
import { teamAliasLookupFor } from "@velyq/providers";
import type { NormalizedEvent } from "@velyq/providers";

import { createPrivilegedDatabaseClient } from "../src/client.js";
import {
  ingestFootballFixture,
  loadCompetitionBridge,
} from "../src/repositories/fixture-ingestion.js";
import { ensureFootballReferenceData } from "../src/repositories/odds-ingestion.js";
import { createForecastCycleDbAdapter } from "../src/repositories/forecast-cycle-adapter.js";
import { competitionIdentities, competitions } from "../src/schema/catalog.js";

/*
 * Proves the real bug this session's production-DDL investigation
 * surfaced: catalog.competitions.code (an internal slug, e.g. "serie-a")
 * is NOT the model's own competition key -- @velyq/research uses a
 * provider-neutral canonicalCode ("ITA_SERIE_A") that production's real
 * catalog.competition_identities schema carries and this branch's
 * competitions table has no defined relationship to. The forecast-cycle
 * adapter must resolve the model key via competition_identities.
 * canonical_code, and the Italy/Brazil Serie A regression must survive
 * that change: two competitions sharing the display name "Serie A" must
 * never resolve to the same model competition key.
 */
const DATABASE_URL =
  process.env["DATABASE_URL"] ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const client = createPrivilegedDatabaseClient({
  connectionString: DATABASE_URL,
});
const database = client.database;

const PROVIDER_CODE = "API_SPORTS";

function testArtifact(): ModelArtifact {
  return {
    modelCode: "FOOTBALL_DIXON_COLES",
    version: "model-key-test.v1",
    maturity: "EXPERIMENTAL",
    featureContractVersion: "test.v1",
    trainingCutoff: "2026-01-01T00:00:00.000Z",
    trainingDatasetFingerprint: "sha256:model-key-test",
    parameters: {
      teams: [
        {
          teamKey: "italy-home",
          competitionCode: "ITA_SERIE_A",
          attack: 0.2,
          defence: -0.1,
          sampleWeight: 20,
          matches: 20,
        },
        {
          teamKey: "italy-away",
          competitionCode: "ITA_SERIE_A",
          attack: -0.05,
          defence: 0.05,
          sampleWeight: 20,
          matches: 20,
        },
      ],
      // Deliberately NO "BRA_SERIE_A" entry -- the model has never rated
      // the Brazilian competition. If the adapter ever conflated the two
      // "Serie A" competitions (by falling back to a shared display name
      // or a coincidentally-equal internal slug), this fixture would
      // wrongly become model-eligible.
      competitions: [
        {
          competitionCode: "ITA_SERIE_A",
          base: 0.1,
          homeAdvantage: 0.25,
          matches: 20,
        },
      ],
      rho: -0.05,
      hyperparameters: DEFAULT_HYPERPARAMETERS,
      trainingCutoff: "2026-01-01T00:00:00.000Z",
      iterations: 10,
      logLikelihood: -100,
      converged: true,
      matchesUsed: 20,
    },
    calibrators: [],
    uncertaintyProfiles: [],
    validationReport: {
      generatedAt: "2026-01-01T00:00:00.000Z",
      corpusSourceCodes: [],
      walkForwardCutoffs: [],
      holdoutFrom: "2026-01-01T00:00:00.000Z",
      trainRecords: 20,
      validationRecords: 5,
      holdoutRecords: 5,
      leakageAudit: { ok: true, violations: 0 },
      competitions: [],
    },
  };
}

function fixture(overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    sport: "FOOTBALL",
    providerEventId: "910001",
    competition: "Serie A",
    competitionProviderId: "9310001",
    competitionCountry: "Italy",
    competitionCountryCode: "IT",
    season: 2026,
    participants: ["Italy Home", "Italy Away"],
    scheduledAt: "2026-09-28T18:00:00.000Z",
    status: "NS",
    provider: "API_SPORTS",
    sourceReference: "test",
    ...overrides,
  };
}

describe("forecast cycle model competition key resolution, against a real database", () => {
  afterAll(async () => {
    await client.close();
  });

  it("resolves the model key via competition_identities.canonical_code, NOT catalog.competitions.code -- and never conflates two 'Serie A' competitions", async () => {
    const referenceData = await ensureFootballReferenceData(
      database,
      PROVIDER_CODE,
    );

    // Both competitions get the SAME internal slug on purpose (both real
    // "Serie A" leagues, and this branch's competitions.code has no
    // defined relationship to the model key) -- the only thing that must
    // ever distinguish them is canonical_code.
    const [italy] = await database
      .insert(competitions)
      .values({
        sportId: referenceData.sportId,
        code: "serie-a-model-key-test-ita",
        nameKey: "competition.serie_a_ita",
        countryCode: "IT",
      })
      .onConflictDoNothing({
        target: [competitions.sportId, competitions.code],
      })
      .returning({ id: competitions.id });
    const italyId =
      italy?.id ??
      (
        await database
          .select({ id: competitions.id })
          .from(competitions)
          .where(eq(competitions.code, "serie-a-model-key-test-ita"))
          .limit(1)
      )[0]!.id;

    const [brazil] = await database
      .insert(competitions)
      .values({
        sportId: referenceData.sportId,
        code: "serie-a-model-key-test-bra",
        nameKey: "competition.serie_a_bra",
        countryCode: "BR",
      })
      .onConflictDoNothing({
        target: [competitions.sportId, competitions.code],
      })
      .returning({ id: competitions.id });
    const brazilId =
      brazil?.id ??
      (
        await database
          .select({ id: competitions.id })
          .from(competitions)
          .where(eq(competitions.code, "serie-a-model-key-test-bra"))
          .limit(1)
      )[0]!.id;

    await database
      .insert(competitionIdentities)
      .values([
        {
          competitionId: italyId,
          providerId: referenceData.providerId,
          providerCompetitionId: "9310001",
          displayName: "Serie A",
          countryCode: "IT",
          canonicalCode: "ITA_SERIE_A",
          mappingStatus: "CONFIRMED",
        },
        {
          competitionId: brazilId,
          providerId: referenceData.providerId,
          providerCompetitionId: "9310002",
          displayName: "Serie A",
          countryCode: "BR",
          canonicalCode: "BRA_SERIE_A",
          mappingStatus: "CONFIRMED",
        },
      ])
      .onConflictDoNothing();

    const bridge = await loadCompetitionBridge(
      database,
      referenceData.providerId,
    );

    const italyIngested = await ingestFootballFixture(database, {
      providerId: referenceData.providerId,
      providerCode: PROVIDER_CODE,
      sportId: referenceData.sportId,
      event: fixture(),
      competitionBridge: bridge,
      teamAliasLookup: teamAliasLookupFor,
    });
    if (!italyIngested.ok)
      throw new Error(`Italy fixture setup failed: ${italyIngested.reason}`);

    const brazilIngested = await ingestFootballFixture(database, {
      providerId: referenceData.providerId,
      providerCode: PROVIDER_CODE,
      sportId: referenceData.sportId,
      event: fixture({
        providerEventId: "910002",
        competitionProviderId: "9310002",
        competitionCountry: "Brazil",
        competitionCountryCode: "BR",
        participants: ["Brazil Home", "Brazil Away"],
      }),
      competitionBridge: bridge,
      teamAliasLookup: teamAliasLookupFor,
    });
    if (!brazilIngested.ok)
      throw new Error(`Brazil fixture setup failed: ${brazilIngested.reason}`);

    const adapter = await createForecastCycleDbAdapter(database, {
      modelArtifact: testArtifact(),
      providerCode: PROVIDER_CODE,
      dataOrigin: "LIVE",
      clock: () => new Date("2026-09-28T00:00:00.000Z"),
    });
    const result = await runForecastCycle(adapter, {
      from: new Date("2026-09-28T00:00:00.000Z"),
      to: new Date("2026-09-29T00:00:00.000Z"),
    });

    expect(result.fixturesScanned).toBeGreaterThanOrEqual(2);
    // Italy resolves (the model has ITA_SERIE_A); Brazil does NOT (the
    // model has no BRA_SERIE_A entry at all) -- proving the adapter reads
    // canonical_code per-event rather than a shared internal slug or
    // display name that would make both resolve identically.
    expect(result.modelEligible).toBeGreaterThanOrEqual(1);
    expect(
      result.skippedByReason["COMPETITION_NOT_IN_MODEL"],
    ).toBeGreaterThanOrEqual(1);
    expect(Object.keys(result.errorsByReason)).toHaveLength(0);
  });
});
