import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import {
  SYNTHETIC_DATA_LABEL,
  type FixtureObservationBatch,
  type FixtureSource,
  type LineupObservationBatch,
  type LineupSource,
  type NormalizedFixtureObservation,
  type NormalizedLineupObservation,
  type NormalizedOddsObservation,
  type OddsObservationBatch,
  type OddsSource,
  type ProviderMarketMapping,
  type ProvenanceRef,
  type QuarantinedProviderObservation,
  type ReplayRequest,
  type SyntheticReplayResult,
  type SyntheticScenarioRecord,
} from "@velyq/contracts";
import { decimalOdds, marketLine, probability } from "@velyq/decimal";
import { eventId } from "@velyq/domain";
import {
  canonicalMarketDefinitions,
  createEventMarket,
  createMarketOutcome,
  serializeEventMarketKey,
  serializeMarketKey,
} from "@velyq/market-semantics";

import { resolveProviderMarketMapping } from "./mapping.js";
import {
  evaluateProviderAction,
  isTrustedProviderPolicyContext,
  parseProviderDataPolicy,
  type ProviderPolicyContext,
} from "./policy.js";
import { deepFreeze } from "./immutable.js";
import {
  isoTimestampSchema,
  parseSyntheticSequence,
  syntheticCatalogBaseSchema,
  type SyntheticCatalogDocument,
  type SyntheticSequenceDocument,
} from "./schemas.js";

const sequenceNames = [
  "sequence-01-opening",
  "sequence-02-movement",
  "sequence-03-lineup-change",
  "sequence-04-repriced",
] as const;
type SequenceName = (typeof sequenceNames)[number];

const ingestionRunIds: Readonly<Record<SequenceName, string>> = {
  "sequence-01-opening": "32000000-0000-4000-8000-000000000001",
  "sequence-02-movement": "32000000-0000-4000-8000-000000000002",
  "sequence-03-lineup-change": "32000000-0000-4000-8000-000000000003",
  "sequence-04-repriced": "32000000-0000-4000-8000-000000000004",
};

type ParseResult<T> =
  | Readonly<{ readonly ok: true; readonly value: T }>
  | Readonly<{
      readonly ok: false;
      readonly error: Readonly<{
        readonly code: "INVALID_PROVIDER_PAYLOAD";
        readonly issues: readonly string[];
      }>;
    }>;

export function parseSyntheticCatalog(
  input: unknown,
): ParseResult<SyntheticCatalogDocument> {
  const parsed = syntheticCatalogBaseSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "INVALID_PROVIDER_PAYLOAD",
        issues: parsed.error.issues.map((issue) => issue.message),
      },
    };
  }

  const policy = parseProviderDataPolicy(parsed.data.policy);
  if (!policy.ok || policy.value.providerCode !== parsed.data.provider.code) {
    return {
      ok: false,
      error: {
        code: "INVALID_PROVIDER_PAYLOAD",
        issues: policy.ok
          ? ["Policy providerCode must match the catalog provider"]
          : policy.error.issues,
      },
    };
  }

  return { ok: true, value: parsed.data };
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;

  return `{${Object.entries(value)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
    .join(",")}}`;
}

function hash(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

export function verifySyntheticSequenceContentHash(input: unknown): boolean {
  const parsed = parseSyntheticSequence(input);
  if (!parsed.ok) return false;
  if (typeof input !== "object" || input === null) return false;
  const { contentHash, ...content } = input as {
    contentHash?: unknown;
  } & Record<string, unknown>;
  return hash(content) === contentHash;
}

function readJson(url: URL): unknown {
  return JSON.parse(readFileSync(url, "utf8")) as unknown;
}

function observationWindow(
  observedTimes: readonly string[],
  fallback: string,
): Readonly<{ from: string; to: string }> {
  if (observedTimes.length === 0) return { from: fallback, to: fallback };
  const sorted = [...observedTimes].sort();
  return { from: sorted[0]!, to: sorted.at(-1)! };
}

function fixturePath(sequenceName: string): string {
  return `packages/providers/src/mock/fixtures/v1/${sequenceName}.json`;
}

function isSequenceName(value: string): value is SequenceName {
  return sequenceNames.some((sequenceName) => sequenceName === value);
}

function provenance(
  catalog: SyntheticCatalogDocument,
  sequence: SyntheticSequenceDocument,
  observation: Readonly<{
    sourceObservationId: string;
    providerExternalId: string;
    providerObservedAt: string;
  }>,
  fixedClock: string,
): ProvenanceRef {
  return {
    isSynthetic: true,
    syntheticLabel: SYNTHETIC_DATA_LABEL,
    providerId: catalog.provider.id,
    providerCode: catalog.provider.code,
    providerExternalId: observation.providerExternalId,
    providerObservedAt: observation.providerObservedAt,
    receivedAt: sequence.receivedAt,
    normalizedAt: fixedClock,
    ingestionRunId: ingestionRunIds[sequence.sequenceName],
    sourceObservationId: observation.sourceObservationId,
    normalizationVersion: "normalization.v1",
    mappingVersion: catalog.mappingVersion,
    sourceObservationHash: hash(observation),
    sourceFixtureHash: sequence.contentHash,
    fixturePath: fixturePath(sequence.sequenceName),
  };
}

function batch<T>(
  catalog: SyntheticCatalogDocument,
  sequence: SyntheticSequenceDocument,
  capability: "FIXTURES" | "ODDS" | "LINEUPS",
  observations: readonly T[],
): import("@velyq/contracts").NormalizedObservationBatch<T> {
  const raw =
    capability === "FIXTURES"
      ? sequence.fixtures
      : capability === "ODDS"
        ? sequence.odds
        : sequence.lineups;

  const result = {
    isSynthetic: true as const,
    syntheticLabel: SYNTHETIC_DATA_LABEL,
    providerCode: catalog.provider.code,
    capability,
    schemaVersion: sequence.schemaVersion,
    observationWindow: observationWindow(
      raw.map(({ providerObservedAt }) => providerObservedAt),
      sequence.receivedAt,
    ),
    providerRequestId: `synthetic:${sequence.sequenceName}:${capability.toLowerCase()}`,
    receivedAt: sequence.receivedAt,
    normalizationVersion: "normalization.v1",
    mappingVersion: catalog.mappingVersion,
    observations,
    sourceFixtureHash: sequence.contentHash,
  };
  return deepFreeze({
    ...result,
    normalizedOutputHash: hash(result),
  });
}

function assertCatalogReferences(
  catalog: SyntheticCatalogDocument,
  sequence: SyntheticSequenceDocument,
): void {
  const participantIds = new Set(catalog.participants.map(({ id }) => id));
  const bookmakerIds = new Set(catalog.bookmakers.map(({ id }) => id));
  const eventIds = new Set(catalog.events.map(({ id }) => id));
  const eventsById = new Map(catalog.events.map((event) => [event.id, event]));
  const competitionId = catalog.competition.id;

  for (const event of catalog.events) {
    if (
      !participantIds.has(event.homeTeamId) ||
      !participantIds.has(event.awayTeamId) ||
      event.homeTeamId === event.awayTeamId
    ) {
      throw new Error(`INVALID_CATALOG_REFERENCE:${event.id}`);
    }
  }

  for (const fixture of sequence.fixtures) {
    const catalogEvent = eventsById.get(fixture.eventId);
    if (
      catalogEvent === undefined ||
      fixture.competitionId !== competitionId ||
      !participantIds.has(fixture.homeTeamId) ||
      !participantIds.has(fixture.awayTeamId) ||
      fixture.homeTeamId === fixture.awayTeamId ||
      fixture.providerExternalId !== catalogEvent.providerExternalId ||
      fixture.startsAt !== catalogEvent.startsAt ||
      fixture.homeTeamId !== catalogEvent.homeTeamId ||
      fixture.awayTeamId !== catalogEvent.awayTeamId
    ) {
      throw new Error(
        `INVALID_CATALOG_REFERENCE:${fixture.sourceObservationId}`,
      );
    }
  }
  for (const odds of sequence.odds) {
    if (!eventIds.has(odds.eventId) || !bookmakerIds.has(odds.bookmakerId)) {
      throw new Error(`INVALID_CATALOG_REFERENCE:${odds.sourceObservationId}`);
    }
  }
  for (const lineup of sequence.lineups) {
    if (
      !eventIds.has(lineup.eventId) ||
      !participantIds.has(lineup.teamId) ||
      catalog.participants.find(({ id }) => id === lineup.teamId)?.type !==
        "TEAM"
    ) {
      throw new Error(
        `INVALID_CATALOG_REFERENCE:${lineup.sourceObservationId}`,
      );
    }
  }
}

export class SyntheticReplaySource
  implements FixtureSource, OddsSource, LineupSource
{
  private readonly catalog: SyntheticCatalogDocument;
  private readonly sequences: ReadonlyMap<
    SequenceName,
    SyntheticSequenceDocument
  >;
  private readonly policyContext: ProviderPolicyContext;

  private constructor(
    catalog: SyntheticCatalogDocument,
    sequences: ReadonlyMap<SequenceName, SyntheticSequenceDocument>,
    policyContext: ProviderPolicyContext,
  ) {
    this.catalog = deepFreeze(catalog);
    this.sequences = deepFreeze(sequences);
    this.policyContext = policyContext;
  }

  static fromRepository(
    policyContext: ProviderPolicyContext,
  ): SyntheticReplaySource {
    if (!isTrustedProviderPolicyContext(policyContext)) {
      throw new Error("TRUSTED_POLICY_CONTEXT_REQUIRED");
    }
    const fixtureDirectory = new URL("./mock/fixtures/v1/", import.meta.url);
    const catalogResult = parseSyntheticCatalog(
      readJson(new URL("catalog.json", fixtureDirectory)),
    );
    if (!catalogResult.ok) {
      throw new Error(
        `INVALID_SYNTHETIC_CATALOG:${catalogResult.error.issues.join("|")}`,
      );
    }

    const documents = new Map<SequenceName, SyntheticSequenceDocument>();
    for (const sequenceName of sequenceNames) {
      const rawSequence = readJson(
        new URL(`${sequenceName}.json`, fixtureDirectory),
      );
      const parsed = parseSyntheticSequence(rawSequence);
      if (!parsed.ok) {
        throw new Error(
          `INVALID_SYNTHETIC_SEQUENCE:${sequenceName}:${parsed.error.issues.join("|")}`,
        );
      }
      if (!verifySyntheticSequenceContentHash(rawSequence)) {
        throw new Error(`SYNTHETIC_SEQUENCE_HASH_MISMATCH:${sequenceName}`);
      }
      if (parsed.value.sequenceName !== sequenceName) {
        throw new Error(`SEQUENCE_NAME_MISMATCH:${sequenceName}`);
      }
      assertCatalogReferences(catalogResult.value, parsed.value);
      documents.set(sequenceName, parsed.value);
    }

    return new SyntheticReplaySource(
      catalogResult.value,
      documents,
      policyContext,
    );
  }

  sequenceNames(): readonly SequenceName[] {
    return deepFreeze([...sequenceNames]);
  }

  private document(request: ReplayRequest): SyntheticSequenceDocument {
    if (!isoTimestampSchema.safeParse(request.fixedClock).success) {
      throw new Error("INVALID_FIXED_CLOCK");
    }
    if (!isSequenceName(request.sequenceName)) {
      throw new Error(`UNKNOWN_REPLAY_SEQUENCE:${request.sequenceName}`);
    }
    const sequence = this.sequences.get(request.sequenceName)!;
    if (request.fixedClock < sequence.receivedAt) {
      throw new Error("FIXED_CLOCK_PRECEDES_RECEIPT");
    }

    const policy = parseProviderDataPolicy(this.catalog.policy);
    if (!policy.ok) throw new Error("INVALID_PROVIDER_POLICY");
    const requestContext = {
      ...this.policyContext,
      asOf: request.fixedClock,
    };
    for (const [action, dataCategory] of [
      ["CACHE", "REPOSITORY_FIXTURE"],
      ["REPLAY", "REPOSITORY_FIXTURE"],
      ["RETAIN_NORMALIZED", "NORMALIZED_FIXTURE"],
    ] as const) {
      const decision = evaluateProviderAction(policy.value, {
        ...requestContext,
        action,
        dataCategory,
      });
      if (!decision.allowed)
        throw new Error(`POLICY_DENIED:${action}:${decision.reason}`);
    }

    return sequence;
  }

  private normalizeFixtures(
    sequence: SyntheticSequenceDocument,
    fixedClock: string,
  ): FixtureObservationBatch {
    const observations: readonly NormalizedFixtureObservation[] =
      sequence.fixtures.map((observation) => ({
        isSynthetic: true,
        syntheticLabel: SYNTHETIC_DATA_LABEL,
        eventId: observation.eventId,
        competitionId: observation.competitionId,
        homeTeamId: observation.homeTeamId,
        awayTeamId: observation.awayTeamId,
        startsAt: observation.startsAt,
        status: observation.status,
        scenarioStates: observation.scenarioStates,
        provenance: provenance(this.catalog, sequence, observation, fixedClock),
      }));
    return batch(this.catalog, sequence, "FIXTURES", observations);
  }

  private normalizeOdds(
    sequence: SyntheticSequenceDocument,
    fixedClock: string,
  ): Readonly<{
    readonly batch: OddsObservationBatch;
    readonly quarantined: readonly QuarantinedProviderObservation[];
  }> {
    const observations: NormalizedOddsObservation[] = [];
    const quarantined: QuarantinedProviderObservation[] = [];
    const mappings: readonly ProviderMarketMapping[] =
      this.catalog.mappings.map((mapping) => ({
        ...mapping,
        mappingVersion: this.catalog.mappingVersion,
      }));

    for (const observation of sequence.odds) {
      const mapped = resolveProviderMarketMapping(
        mappings,
        {
          providerMarketKey: observation.providerMarketKey,
          providerOutcomeKey: observation.providerOutcomeKey,
          mappingVersion: this.catalog.mappingVersion,
        },
        observation.providerObservedAt,
      );
      if (!mapped.ok) {
        quarantined.push({
          isSynthetic: true,
          syntheticLabel: SYNTHETIC_DATA_LABEL,
          sourceObservationId: observation.sourceObservationId,
          providerMarketKey: observation.providerMarketKey,
          providerOutcomeKey: observation.providerOutcomeKey,
          reason: mapped.reason,
          provenance: provenance(
            this.catalog,
            sequence,
            observation,
            fixedClock,
          ),
        });
        continue;
      }

      const definition =
        canonicalMarketDefinitions[mapped.value.canonicalDefinitionCode];
      const parsedEventId = eventId(observation.eventId);
      const parsedLine =
        observation.line === undefined
          ? undefined
          : marketLine(observation.line);
      const parsedOdds = decimalOdds(observation.decimalOdds);
      if (
        !parsedEventId.ok ||
        !parsedOdds.ok ||
        (parsedLine !== undefined && !parsedLine.ok)
      ) {
        quarantined.push({
          isSynthetic: true,
          syntheticLabel: SYNTHETIC_DATA_LABEL,
          sourceObservationId: observation.sourceObservationId,
          providerMarketKey: observation.providerMarketKey,
          providerOutcomeKey: observation.providerOutcomeKey,
          reason:
            parsedLine !== undefined && !parsedLine.ok
              ? "INVALID_MARKET_LINE"
              : "INVALID_MARKET_IDENTITY",
          provenance: provenance(
            this.catalog,
            sequence,
            observation,
            fixedClock,
          ),
        });
        continue;
      }

      const eventMarket = createEventMarket({
        definition,
        eventId: parsedEventId.value,
        ...(parsedLine === undefined ? {} : { line: parsedLine.value }),
      });
      if (!eventMarket.ok) {
        quarantined.push({
          isSynthetic: true,
          syntheticLabel: SYNTHETIC_DATA_LABEL,
          sourceObservationId: observation.sourceObservationId,
          providerMarketKey: observation.providerMarketKey,
          providerOutcomeKey: observation.providerOutcomeKey,
          reason: "INVALID_MARKET_IDENTITY",
          provenance: provenance(
            this.catalog,
            sequence,
            observation,
            fixedClock,
          ),
        });
        continue;
      }
      const outcome = createMarketOutcome(
        eventMarket.value,
        mapped.value.canonicalOutcomeCode,
      );
      if (!outcome.ok) {
        quarantined.push({
          isSynthetic: true,
          syntheticLabel: SYNTHETIC_DATA_LABEL,
          sourceObservationId: observation.sourceObservationId,
          providerMarketKey: observation.providerMarketKey,
          providerOutcomeKey: observation.providerOutcomeKey,
          reason: "INVALID_MARKET_IDENTITY",
          provenance: provenance(
            this.catalog,
            sequence,
            observation,
            fixedClock,
          ),
        });
        continue;
      }

      observations.push({
        isSynthetic: true,
        syntheticLabel: SYNTHETIC_DATA_LABEL,
        eventId: observation.eventId,
        bookmakerId: observation.bookmakerId,
        marketDefinitionCode: mapped.value.canonicalDefinitionCode,
        outcomeCode: mapped.value.canonicalOutcomeCode,
        marketKey: serializeEventMarketKey(eventMarket.value),
        outcomeKey: serializeMarketKey(outcome.value.key),
        ...(parsedLine === undefined ? {} : { line: parsedLine.value }),
        decimalOdds: parsedOdds.value,
        status: observation.status,
        scenarioStates: observation.scenarioStates,
        provenance: provenance(this.catalog, sequence, observation, fixedClock),
      });
    }

    return {
      batch: batch(this.catalog, sequence, "ODDS", observations),
      quarantined,
    };
  }

  private normalizeLineups(
    sequence: SyntheticSequenceDocument,
    fixedClock: string,
  ): LineupObservationBatch {
    const observations: readonly NormalizedLineupObservation[] =
      sequence.lineups.map((observation) => {
        const confidence = probability(observation.confidence);
        if (!confidence.ok)
          throw new Error(
            `INVALID_LINEUP_CONFIDENCE:${observation.sourceObservationId}`,
          );
        const playersById = new Map(
          this.catalog.players.map((player) => [player.id, player]),
        );
        const playersByLabel = new Map(
          this.catalog.players.map((player) => [player.displayName, player]),
        );
        const players =
          observation.playerIds.length > 0
            ? observation.playerIds.map((id) => playersById.get(id))
            : (observation.playerLabels ?? []).map((label) =>
                playersByLabel.get(label),
              );
        if (
          players.some(
            (player) =>
              player === undefined || player.teamId !== observation.teamId,
          )
        ) {
          throw new Error(
            `INVALID_CATALOG_PLAYER_REFERENCE:${observation.sourceObservationId}`,
          );
        }
        return {
          isSynthetic: true,
          syntheticLabel: SYNTHETIC_DATA_LABEL,
          eventId: observation.eventId,
          teamId: observation.teamId,
          status: observation.status,
          confidence: confidence.value,
          players: players.map((player) => ({
            id: player!.id,
            displayName: player!.displayName,
            isSynthetic: true as const,
            syntheticLabel: SYNTHETIC_DATA_LABEL,
          })),
          formation: observation.formation,
          scenarioStates: observation.scenarioStates,
          provenance: provenance(
            this.catalog,
            sequence,
            observation,
            fixedClock,
          ),
        };
      });
    return batch(this.catalog, sequence, "LINEUPS", observations);
  }

  async replay(request: ReplayRequest): Promise<SyntheticReplayResult> {
    const sequence = this.document(request);
    const fixtures = this.normalizeFixtures(sequence, request.fixedClock);
    const odds = this.normalizeOdds(sequence, request.fixedClock);
    const lineups = this.normalizeLineups(sequence, request.fixedClock);
    const oddsBySourceId = new Map(
      odds.batch.observations.map((observation) => [
        observation.provenance.sourceObservationId,
        observation,
      ]),
    );
    const scenarios: readonly SyntheticScenarioRecord[] = sequence.scenarios
      ? (sequence.scenarios.map((scenario) => {
          const oddsObservation =
            scenario.evidence.kind === "PRICE" &&
            scenario.sourceObservationIds[0] !== undefined
              ? oddsBySourceId.get(scenario.sourceObservationIds[0])
              : undefined;
          return {
            ...scenario,
            ...(oddsObservation === undefined
              ? {}
              : {
                  marketKey: oddsObservation.marketKey,
                  outcomeKey: oddsObservation.outcomeKey,
                }),
            isSynthetic: true as const,
            syntheticLabel: SYNTHETIC_DATA_LABEL,
          };
        }) as readonly SyntheticScenarioRecord[])
      : ((sequence.scenarioStates ?? []).map((state, index) => ({
          isSynthetic: true as const,
          syntheticLabel: SYNTHETIC_DATA_LABEL,
          id: `${sequence.sequenceName}-scenario-${index}`,
          state,
          eventId:
            sequence.fixtures[0]?.eventId ??
            sequence.odds[0]?.eventId ??
            sequence.lineups[0]?.eventId ??
            "00000000-0000-0000-0000-000000000000",
          sourceObservationIds: [],
          evidence: {
            kind: "ABSENCE" as const,
            value: "NO_DIRECT_SCENARIO_RECORD",
          },
        })) as readonly SyntheticScenarioRecord[]);
    const result = {
      isSynthetic: true as const,
      syntheticLabel: SYNTHETIC_DATA_LABEL,
      sequenceName: sequence.sequenceName,
      fixturePath: fixturePath(sequence.sequenceName),
      scenarios,
      fixtures,
      odds: odds.batch,
      lineups,
      quarantined: odds.quarantined,
    };
    return deepFreeze({
      ...result,
      sourceFixtureHash: sequence.contentHash,
      normalizedOutputHash: hash(result),
    });
  }

  async listFixtureObservations(
    request: ReplayRequest,
  ): Promise<FixtureObservationBatch> {
    return (await this.replay(request)).fixtures;
  }

  async listOddsObservations(
    request: ReplayRequest,
  ): Promise<import("@velyq/contracts").OddsObservationResult> {
    const replay = await this.replay(request);
    return { batch: replay.odds, quarantined: replay.quarantined };
  }

  async listLineupObservations(
    request: ReplayRequest,
  ): Promise<LineupObservationBatch> {
    return (await this.replay(request)).lineups;
  }
}
