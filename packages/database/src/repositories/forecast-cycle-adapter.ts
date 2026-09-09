import { assessOddsFreshness } from "@velyq/application/odds-freshness";
import { createHash } from "node:crypto";
import { and, asc, desc, eq, gte, lt, ne } from "drizzle-orm";
import {
  assessDataQuality,
  DEFAULT_DATA_QUALITY_POLICY,
  type DataQualityAssessment,
} from "@velyq/analytics";
import { artifactFingerprint, type ModelArtifact } from "@velyq/research";
import type {
  ForecastCycleDeps,
  ForecastCycleFixture,
} from "@velyq/application/forecast-cycle";

import type { PrivilegedVelyqDatabase } from "../client.js";
import {
  competitionIdentities,
  competitions,
  eventParticipants,
  events,
  participants,
  sports,
} from "../schema/catalog.js";
import { eventMarketOutcomes, eventMarkets } from "../schema/market.js";
import { lineupObservations } from "../schema/intelligence.js";
import {
  calibrationVersions,
  dataQualityPolicyVersions,
  modelDefinitions,
  modelVersions,
} from "../schema/intelligence.js";
import {
  DatabaseDecisionRepository,
  DatabaseForecastRepository,
  DatabaseFreshestOddsReader,
} from "./forecast-decision.js";
import { DatabasePredictionRepository } from "./predictions.js";
import { DatabaseQualityRepository } from "./quality.js";
import { ensureFootballReferenceData } from "./odds-ingestion.js";

/**
 * Deterministic uuid from a seed string, same construction as
 * `deterministicEventId` in @velyq/domain: a same-inputs-same-id
 * derivation is what makes an upsert idempotent by construction, without a
 * prior lookup to detect the duplicate.
 */
function deterministicId(seed: string): string {
  const digest = createHash("sha256").update(seed).digest("hex");
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`.toLowerCase();
}

/**
 * Binds `runForecastCycle()`'s ports to the real repositories.
 *
 * The heavy identity-resolution lifting (provider competition -> internal
 * competition, provider team name -> catalog participant) already happened
 * once, correctly, at fixture ingestion time (`ingestFootballFixture` in
 * fixture-ingestion.ts refuses to write an event at all until both resolve)
 * -- so `resolveCompetition`/`resolveHomeTeam`/`resolveAwayTeam` here read
 * already-established catalog state rather than re-deriving identity from
 * a display name. Team resolution reads `participants.code` directly;
 * competition resolution reads `competition_identities.canonical_code`
 * (see `modelCompetitionKeyFor` below) -- NOT `competitions.code`, which
 * is an unrelated internal slug the model has never heard of. What
 * genuinely remains open at forecast-cycle time, and is NOT decided here,
 * is *model* eligibility (does the Dixon-Coles artifact have a rating for
 * this competition/team code) -- that stays inside `runForecastCycle`
 * itself, via `resolveExpectedGoals`.
 */
export async function createForecastCycleDbAdapter(
  database: PrivilegedVelyqDatabase,
  options: Readonly<{
    modelArtifact: ModelArtifact;
    providerCode: string;
    dataOrigin: "LIVE" | "SYNTHETIC_DEMO";
    clock?: () => Date;
    decisionPolicy?: ForecastCycleDeps["decisionPolicy"];
    triggerJobId?: string;
  }>,
): Promise<ForecastCycleDeps> {
  const referenceData = await ensureFootballReferenceData(
    database,
    options.providerCode,
  );

  const [modelDefinition] = await database
    .insert(modelDefinitions)
    .values({
      code: options.modelArtifact.modelCode,
      displayName: options.modelArtifact.modelCode,
      description: "Dixon-Coles football forecast model",
    })
    .onConflictDoNothing({ target: [modelDefinitions.code] })
    .returning({ id: modelDefinitions.id });
  const modelDefinitionId =
    modelDefinition?.id ??
    (
      await database
        .select({ id: modelDefinitions.id })
        .from(modelDefinitions)
        .where(eq(modelDefinitions.code, options.modelArtifact.modelCode))
        .limit(1)
    )[0]!.id;

  const [modelVersion] = await database
    .insert(modelVersions)
    .values({
      modelDefinitionId,
      version: options.modelArtifact.version,
      maturityStatus: options.modelArtifact.maturity,
      validationStatus: "UNVALIDATED",
      featureContractVersion: options.modelArtifact.featureContractVersion,
      artifactReference: artifactFingerprint(options.modelArtifact),
    })
    .onConflictDoNothing({
      target: [modelVersions.modelDefinitionId, modelVersions.version],
    })
    .returning({ id: modelVersions.id });
  const modelVersionId =
    modelVersion?.id ??
    (
      await database
        .select({ id: modelVersions.id })
        .from(modelVersions)
        .where(
          and(
            eq(modelVersions.modelDefinitionId, modelDefinitionId),
            eq(modelVersions.version, options.modelArtifact.version),
          ),
        )
        .limit(1)
    )[0]!.id;

  const [calibrationVersion] = await database
    .insert(calibrationVersions)
    .values({
      modelVersionId,
      version: "identity.v1",
      method: "NONE",
      parameters: {},
      validationStatus: "UNVALIDATED",
    })
    .onConflictDoNothing({
      target: [calibrationVersions.modelVersionId, calibrationVersions.version],
    })
    .returning({ id: calibrationVersions.id });
  const calibrationVersionId =
    calibrationVersion?.id ??
    (
      await database
        .select({ id: calibrationVersions.id })
        .from(calibrationVersions)
        .where(eq(calibrationVersions.modelVersionId, modelVersionId))
        .limit(1)
    )[0]!.id;

  const [qualityPolicy] = await database
    .insert(dataQualityPolicyVersions)
    .values({
      code: "forecast-cycle-default",
      version: DEFAULT_DATA_QUALITY_POLICY.policyVersion,
      validationStatus:
        DEFAULT_DATA_QUALITY_POLICY.validationStatus ?? "DEVELOPMENT_HEURISTIC",
      definition: DEFAULT_DATA_QUALITY_POLICY.definition,
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
    })
    .onConflictDoNothing({
      target: [
        dataQualityPolicyVersions.code,
        dataQualityPolicyVersions.version,
      ],
    })
    .returning({ id: dataQualityPolicyVersions.id });
  const qualityPolicyId =
    qualityPolicy?.id ??
    (
      await database
        .select({ id: dataQualityPolicyVersions.id })
        .from(dataQualityPolicyVersions)
        .where(
          and(
            eq(dataQualityPolicyVersions.code, "forecast-cycle-default"),
            eq(
              dataQualityPolicyVersions.version,
              DEFAULT_DATA_QUALITY_POLICY.policyVersion,
            ),
          ),
        )
        .limit(1)
    )[0]!.id;

  const predictionRepository = new DatabasePredictionRepository(database);
  const forecastRepository = new DatabaseForecastRepository(database);
  const decisionRepository = new DatabaseDecisionRepository(database);
  const oddsReader = new DatabaseFreshestOddsReader(database);
  const qualityRepository = new DatabaseQualityRepository(database);

  /**
   * Ensures the FT 1X2 event market and its three outcomes exist for this
   * event, independent of whether any odds have ever been ingested for it.
   * A fixture with zero odds must still be able to receive a forecast (see
   * `runForecastCycle`'s no-odds path), so this cannot be left to odds
   * ingestion's own lazy upsert -- the mandate's own regression is a
   * fixture nobody has priced yet, which is exactly the case this exists
   * to cover.
   */
  async function ensureOneXTwoOutcomes(
    eventId: string,
  ): Promise<Record<"HOME" | "DRAW" | "AWAY", string>> {
    const [eventMarket] = await database
      .insert(eventMarkets)
      .values({
        eventId,
        marketDefinitionId: referenceData.marketDefinitionId,
        subjectParticipantId: null,
        lineValue: null,
        canonicalKey: `${eventId}:${referenceData.marketDefinitionId}:null:null`,
      })
      .onConflictDoNothing({
        target: [
          eventMarkets.eventId,
          eventMarkets.marketDefinitionId,
          eventMarkets.subjectParticipantId,
          eventMarkets.lineValue,
        ],
      })
      .returning({ id: eventMarkets.id });
    const eventMarketId =
      eventMarket?.id ??
      (
        await database
          .select({ id: eventMarkets.id })
          .from(eventMarkets)
          .where(eq(eventMarkets.eventId, eventId))
          .limit(1)
      )[0]!.id;

    const outcomeIds: Record<"HOME" | "DRAW" | "AWAY", string> = {
      HOME: "",
      DRAW: "",
      AWAY: "",
    };
    for (const code of ["HOME", "DRAW", "AWAY"] as const) {
      const outcomeDefinitionId = referenceData.outcomeDefinitionIds[code];
      const [row] = await database
        .insert(eventMarketOutcomes)
        .values({
          eventMarketId,
          marketDefinitionId: referenceData.marketDefinitionId,
          outcomeDefinitionId,
          canonicalKey: `${eventMarketId}:${outcomeDefinitionId}`,
        })
        .onConflictDoNothing({
          target: [
            eventMarketOutcomes.eventMarketId,
            eventMarketOutcomes.outcomeDefinitionId,
          ],
        })
        .returning({ id: eventMarketOutcomes.id });
      outcomeIds[code] =
        row?.id ??
        (
          await database
            .select({ id: eventMarketOutcomes.id })
            .from(eventMarketOutcomes)
            .where(
              and(
                eq(eventMarketOutcomes.eventMarketId, eventMarketId),
                eq(
                  eventMarketOutcomes.outcomeDefinitionId,
                  outcomeDefinitionId,
                ),
              ),
            )
            .limit(1)
        )[0]!.id;
    }
    return outcomeIds;
  }

  /**
   * The model competition key for an internal competition entity.
   *
   * `catalog.competitions.code` is an internal slug ("serie-a") with no
   * defined relationship to @velyq/research's own competition code space
   * ("ITA_SERIE_A") -- confirmed as a real, distinct concept, not an
   * assumption, by reading the actual production
   * `catalog.competition_identities` schema, which carries the model key
   * under `canonical_code` precisely because `competitions.code` is not
   * it. Prefers a CONFIRMED-mapped identity row's `canonical_code`; falls
   * back to any mapped row if none is CONFIRMED yet, then to
   * `competitions.code` only when no competition_identities row links to
   * this competition at all (the schema seeded before this distinction
   * existed, e.g. this package's own DB-integration tests, which
   * deliberately use matching codes on both sides).
   */
  async function modelCompetitionKeyFor(
    competition: typeof competitions.$inferSelect,
  ): Promise<string> {
    const identityRows = await database
      .select({
        canonicalCode: competitionIdentities.canonicalCode,
        mappingStatus: competitionIdentities.mappingStatus,
      })
      .from(competitionIdentities)
      .where(eq(competitionIdentities.competitionId, competition.id));

    const confirmed = identityRows.find(
      (row) => row.mappingStatus === "CONFIRMED" && row.canonicalCode !== null,
    );
    const anyMapped = identityRows.find((row) => row.canonicalCode !== null);
    return (confirmed ?? anyMapped)?.canonicalCode ?? competition.code;
  }

  async function computeLineupState(
    fixture: ForecastCycleFixture,
  ): Promise<"EXPECTED" | "OFFICIAL" | "MISSING"> {
    const participantRows = await database
      .select({ id: participants.id, role: eventParticipants.role })
      .from(eventParticipants)
      .innerJoin(
        participants,
        eq(eventParticipants.participantId, participants.id),
      )
      .where(eq(eventParticipants.eventId, fixture.eventId));

    const statuses = await Promise.all(
      participantRows.map(async (row) => {
        const [latest] = await database
          .select({ status: lineupObservations.status })
          .from(lineupObservations)
          .where(
            and(
              eq(lineupObservations.eventId, fixture.eventId),
              eq(lineupObservations.teamParticipantId, row.id),
            ),
          )
          .orderBy(desc(lineupObservations.receivedAt))
          .limit(1);
        return latest?.status ?? "UNAVAILABLE";
      }),
    );
    if (statuses.length === 0 || statuses.some((s) => s === "UNAVAILABLE"))
      return "MISSING";
    return statuses.every((s) => s === "OFFICIAL") ? "OFFICIAL" : "EXPECTED";
  }

  return {
    clock: options.clock ?? (() => new Date()),
    ...(options.decisionPolicy
      ? { decisionPolicy: options.decisionPolicy }
      : {}),
    /*
     * Only ever a real `operations.jobs` id. The column is a foreign key to
     * that table, so anything invented -- a label, or a hash of one -- is
     * rejected, and the column is nullable precisely because a
     * trigger-initiated cycle has no queued job behind it. Such a run is
     * identified by `prediction_runs.id`, which is derived deterministically
     * below.
     */
    ...(options.triggerJobId ? { triggerJobId: options.triggerJobId } : {}),
    modelArtifact: options.modelArtifact,
    modelVersionId,
    calibrationVersionId,

    async loadEligibleFixtures(window) {
      const rows = await database
        .select({
          event: events,
          competition: competitions,
        })
        .from(events)
        .innerJoin(competitions, eq(events.competitionId, competitions.id))
        .innerJoin(sports, eq(events.sportId, sports.id))
        .where(
          and(
            eq(sports.code, "FOOTBALL"),
            eq(events.synthetic, options.dataOrigin === "SYNTHETIC_DEMO"),
            gte(events.startsAt, window.from),
            lt(events.startsAt, window.to),
            ne(events.status, "FINAL"),
            ne(events.status, "CANCELLED"),
            ne(events.status, "ABANDONED"),
          ),
        )
        .orderBy(asc(events.startsAt), asc(events.id));

      const fixtures: ForecastCycleFixture[] = [];
      for (const row of rows) {
        const participantRows = await database
          .select({
            role: eventParticipants.role,
            code: participants.code,
            displayName: participants.displayName,
          })
          .from(eventParticipants)
          .innerJoin(
            participants,
            eq(eventParticipants.participantId, participants.id),
          )
          .where(eq(eventParticipants.eventId, row.event.id));
        const home = participantRows.find((p) => p.role === "HOME");
        const away = participantRows.find((p) => p.role === "AWAY");
        if (!home || !away) continue;

        const outcomeIds = await ensureOneXTwoOutcomes(row.event.id);
        fixtures.push({
          eventId: row.event.id,
          providerCompetitionCode: await modelCompetitionKeyFor(
            row.competition,
          ),
          homeTeam: { sourceName: home.displayName, normalizedName: home.code },
          awayTeam: { sourceName: away.displayName, normalizedName: away.code },
          eventMarketOutcomeIds: outcomeIds,
        });
      }
      return fixtures;
    },

    async resolveCompetition(fixture) {
      // Already resolved at ingestion (see module doc comment) -- trusted
      // here as the internal competition code, never re-derived from a
      // display name.
      return {
        ok: true,
        modelCompetitionCode: fixture.providerCompetitionCode,
      };
    },

    async resolveHomeTeam(fixture) {
      return {
        status: "PROVIDER_IDENTITY_MATCH",
        teamKey: fixture.homeTeam.normalizedName,
      };
    },

    async resolveAwayTeam(fixture) {
      return {
        status: "PROVIDER_IDENTITY_MATCH",
        teamKey: fixture.awayTeam.normalizedName,
      };
    },

    async getLineupState(fixture) {
      return computeLineupState(fixture);
    },

    async assessQuality(fixture, selection, asOf) {
      const eventMarketOutcomeId = fixture.eventMarketOutcomeIds[selection];
      const existing = await qualityRepository.getLatestAsOf(
        fixture.eventId,
        asOf,
        eventMarketOutcomeId,
      );
      if (existing) {
        return {
          assessmentId: existing.id,
          assessment: {
            policyVersion: DEFAULT_DATA_QUALITY_POLICY.policyVersion,
            asOf: existing.asOf.toISOString(),
            grade: existing.grade as DataQualityAssessment["grade"],
            score: existing.numericScore as DataQualityAssessment["score"],
            components:
              existing.components as DataQualityAssessment["components"],
            reasonCodes: existing.reasonCodes,
          },
        };
      }

      const odds = await oddsReader.getAllValidObservations(
        eventMarketOutcomeId,
        asOf,
      );
      const lineup = await computeLineupState(fixture);
      const assessment = assessDataQuality({
        policyVersion: DEFAULT_DATA_QUALITY_POLICY.policyVersion,
        asOf: asOf.toISOString(),
        receivedAt: asOf.toISOString(),
        priceCount: odds.length,
        bookmakerCount: new Set(odds.map((o) => o.bookmakerId)).size,
        lineup,
        mappingConfidence: "HIGH",
        edgeAvailable: odds.length > 0,
        edgePresent: false,
      });

      const persisted = await qualityRepository.append({
        policyVersionId: qualityPolicyId,
        eventId: fixture.eventId,
        marketOutcomeId: eventMarketOutcomeId,
        asOf,
        grade: assessment.grade,
        numericScore: assessment.score,
        components: assessment.components,
        reasonCodes: assessment.reasonCodes,
      });
      return { assessmentId: persisted.id, assessment };
    },

    async getFreshestOdds(eventMarketOutcomeId, asOf) {
      const row = await oddsReader.getFreshestValidOdds(
        eventMarketOutcomeId,
        asOf,
      );
      if (!row) return null;

      /*
       * "Valid" in the reader means only "not from the future" -- it applies
       * no age bound at all. A production audit found the newest price in the
       * database was 27 hours old and still being priced as the live market,
       * which makes every derived number (implied probability, edge, EV,
       * price validity) a statement about yesterday presented as one about
       * now.
       *
       * A non-actionable price is withheld rather than downgraded, so the
       * cycle takes its existing no-odds path and reports NO_ODDS_AT_CUTOFF /
       * INSUFFICIENT_DATA. That is the honest outcome: the observation still
       * exists as evidence and as movement history for RADAR, it simply
       * cannot be the basis of an EDGE the customer could not actually bet
       * into.
       */
      const freshness = assessOddsFreshness(
        new Date(row.providerObservedAt),
        asOf,
      );
      if (!freshness.actionable) return null;

      return { id: row.id, decimalOdds: row.decimalOdds };
    },

    async persistPrediction(input) {
      /*
       * A stable run id derived from (event, outcome, feature cutoff, model
       * version) is what makes two cycle runs against unchanged inputs
       * idempotent: DatabasePredictionRepository looks up an existing run
       * by this id before inserting, and predictions is itself unique on
       * (predictionRunId, eventMarketOutcomeId) -- without a stable id here,
       * every call would mint a brand-new run and duplicate the prediction.
       * A materially different run (new model version, new feature cutoff)
       * naturally derives a different id, so a genuine re-forecast still
       * gets its own new run/prediction.
       */
      const runId = deterministicId(
        `prediction-run:${input.run.eventId}:${input.prediction.eventMarketOutcomeId}:${input.run.featureCutoff.toISOString()}:${input.run.modelVersionId}`,
      );
      const persisted = await predictionRepository.append({
        run: { ...input.run, id: runId },
        prediction: { ...input.prediction },
        inputs: input.inputs,
      });
      return { id: persisted.prediction.id };
    },

    async persistForecast(input) {
      const persisted = await forecastRepository.append(input);
      return { id: persisted.id };
    },

    async persistDecision(input) {
      const persisted = await decisionRepository.append({
        ...input,
        decisionSnapshot: input.decisionSnapshot,
      });
      return { id: persisted.id };
    },
  };
}
