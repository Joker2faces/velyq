import { decimalOdds, marketLine, probability } from "@velyq/decimal";
import { canonicalMarketDefinitions } from "@velyq/market-semantics";
import { z } from "zod";

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

export const isoTimestampSchema = z.string().refine((value) => {
  if (!ISO_TIMESTAMP.test(value)) return false;
  const date = new Date(value);
  return (
    !Number.isNaN(date.valueOf()) &&
    date.toISOString().replace(".000Z", "Z") === value
  );
}, "Expected a real UTC timestamp with second precision");

export const canonicalUuidSchema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    "Expected a canonical lowercase UUID",
  );

const contentHashSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const syntheticLabelSchema = z.literal("Synthetic data");
const scenarioStateSchema = z.enum([
  "OPENING_PRICE",
  "CURRENT_PRICE",
  "STALE_PRICE",
  "MISSING_PRICE",
  "EXPECTED_LINEUP",
  "CHANGED_LINEUP",
  "OFFICIAL_LINEUP",
  "MISSING_LINEUP",
  "STRONG_EDGE",
  "NO_BET",
  "WAIT_FOR_LINEUP",
  "RADAR_MOVEMENT",
  "EDGE_DISAPPEARED",
  "INSUFFICIENT_DATA",
]);
const canonicalDefinitionCodeSchema = z.enum([
  "FOOTBALL_FULL_TIME_1X2",
  "FOOTBALL_FULL_TIME_TOTAL",
]);
const canonicalOutcomeCodeSchema = z.enum([
  "HOME",
  "DRAW",
  "AWAY",
  "OVER",
  "UNDER",
]);

export const providerMarketMappingSchema = z
  .object({
    id: canonicalUuidSchema,
    providerMarketKey: z.string().min(1),
    providerOutcomeKey: z.string().min(1),
    canonicalDefinitionCode: canonicalDefinitionCodeSchema,
    canonicalOutcomeCode: canonicalOutcomeCodeSchema,
    mappingVersion: z.string().min(1),
    effectiveFrom: isoTimestampSchema,
    effectiveTo: isoTimestampSchema.nullable(),
  })
  .strict()
  .superRefine((mapping, context) => {
    const definition =
      canonicalMarketDefinitions[mapping.canonicalDefinitionCode];
    if (!definition.outcomeCodes.includes(mapping.canonicalOutcomeCode)) {
      context.addIssue({
        code: "custom",
        message: "Canonical outcome is not allowed by the market definition",
        path: ["canonicalOutcomeCode"],
      });
    }
    if (
      mapping.effectiveTo !== null &&
      mapping.effectiveTo <= mapping.effectiveFrom
    ) {
      context.addIssue({
        code: "custom",
        message: "effectiveTo must be later than effectiveFrom",
        path: ["effectiveTo"],
      });
    }
  });

const participantSchema = z
  .object({
    id: canonicalUuidSchema,
    code: z.string().regex(/^[A-Z][A-Z0-9_]+$/),
    displayName: z
      .string()
      .min(1)
      .refine((value) => value.includes("(Synthetic)")),
    type: z.enum(["TEAM", "PLAYER"]),
  })
  .strict();
const bookmakerSchema = z
  .object({
    id: canonicalUuidSchema,
    code: z.string().regex(/^SYNTHETIC_BOOK_[A-Z]$/),
    displayName: z.string().regex(/^Synthetic Book [A-Z]$/),
    synthetic: z.literal(true),
  })
  .strict();

export const syntheticCatalogBaseSchema = z
  .object({
    schemaVersion: z.literal("synthetic-catalog.v1"),
    synthetic: z.literal(true),
    syntheticLabel: syntheticLabelSchema,
    provider: z
      .object({
        id: canonicalUuidSchema,
        code: z.literal("SYNTHETIC_FIXTURES"),
        displayName: z.literal("VELYQ Synthetic Fixtures"),
      })
      .strict(),
    competition: z
      .object({
        id: canonicalUuidSchema,
        code: z.literal("SYNTHETIC_LEAGUE"),
        displayName: z.literal("Synthetic League"),
      })
      .strict(),
    participants: z.array(participantSchema),
    events: z.array(
      z
        .object({
          id: canonicalUuidSchema,
          providerExternalId: z.string().min(1),
          startsAt: isoTimestampSchema,
          homeTeamId: canonicalUuidSchema,
          awayTeamId: canonicalUuidSchema,
        })
        .strict(),
    ),
    players: z.array(
      z
        .object({
          id: canonicalUuidSchema,
          code: z.string().regex(/^[A-Z][A-Z0-9_]+$/),
          displayName: z
            .string()
            .min(1)
            .refine((value) => value.includes("(Synthetic)")),
          teamId: canonicalUuidSchema,
          synthetic: z.literal(true),
        })
        .strict(),
    ),
    bookmakers: z.array(bookmakerSchema),
    mappingVersion: z.literal("mapping.v1"),
    mappings: z.array(providerMarketMappingSchema),
    policy: z.unknown(),
  })
  .strict()
  .superRefine((catalog, context) => {
    for (const mapping of catalog.mappings) {
      if (mapping.mappingVersion !== catalog.mappingVersion) {
        context.addIssue({
          code: "custom",
          message: "Mapping record version must match catalog mappingVersion",
          path: ["mappings"],
        });
      }
    }
  });

const fixtureObservationSchema = z
  .object({
    sourceObservationId: canonicalUuidSchema,
    providerExternalId: z.string().min(1),
    providerObservedAt: isoTimestampSchema,
    eventId: canonicalUuidSchema,
    competitionId: canonicalUuidSchema,
    homeTeamId: canonicalUuidSchema,
    awayTeamId: canonicalUuidSchema,
    startsAt: isoTimestampSchema,
    status: z.literal("SCHEDULED"),
    scenarioStates: z.array(scenarioStateSchema),
  })
  .strict();

const decimalOddsStringSchema = z.string().superRefine((value, context) => {
  const parsed = decimalOdds(value);
  if (!parsed.ok)
    context.addIssue({ code: "custom", message: parsed.error.message });
});

const marketLineStringSchema = z.string().superRefine((value, context) => {
  const parsed = marketLine(value);
  if (!parsed.ok)
    context.addIssue({ code: "custom", message: parsed.error.message });
});

const oddsObservationSchema = z
  .object({
    sourceObservationId: canonicalUuidSchema,
    providerExternalId: z.string().min(1),
    providerObservedAt: isoTimestampSchema,
    eventId: canonicalUuidSchema,
    bookmakerId: canonicalUuidSchema,
    providerMarketKey: z.string().min(1),
    providerOutcomeKey: z.string().min(1),
    line: marketLineStringSchema.optional(),
    decimalOdds: decimalOddsStringSchema,
    status: z.enum(["ACTIVE", "SUSPENDED", "REMOVED"]),
    scenarioStates: z.array(scenarioStateSchema),
  })
  .strict();

const probabilityStringSchema = z.string().superRefine((value, context) => {
  const parsed = probability(value);
  if (!parsed.ok)
    context.addIssue({ code: "custom", message: parsed.error.message });
});

const lineupObservationSchema = z
  .object({
    sourceObservationId: canonicalUuidSchema,
    providerExternalId: z.string().min(1),
    providerObservedAt: isoTimestampSchema,
    eventId: canonicalUuidSchema,
    teamId: canonicalUuidSchema,
    status: z.enum(["EXPECTED", "CHANGED", "OFFICIAL", "MISSING"]),
    confidence: probabilityStringSchema,
    playerIds: z.array(canonicalUuidSchema).default([]),
    playerLabels: z
      .array(
        z
          .string()
          .min(1)
          .refine((value) => value.includes("(Synthetic)")),
      )
      .optional(),
    formation: z.string().min(1).nullable(),
    scenarioStates: z.array(scenarioStateSchema),
  })
  .strict()
  .superRefine((lineup, context) => {
    if (lineup.status === "MISSING" && lineup.playerIds.length !== 0) {
      context.addIssue({
        code: "custom",
        message: "Missing lineups cannot include players",
        path: ["playerIds"],
      });
    }
    if (lineup.status !== "MISSING" && lineup.playerIds.length === 0) {
      if (
        lineup.playerLabels === undefined ||
        lineup.playerLabels.length === 0
      ) {
        context.addIssue({
          code: "custom",
          message: "Available lineups must include catalog player identities",
          path: ["playerIds"],
        });
      }
    }
    if (
      lineup.playerLabels !== undefined &&
      lineup.playerIds.length > 0 &&
      lineup.playerLabels.length !== lineup.playerIds.length
    ) {
      context.addIssue({
        code: "custom",
        message: "Player ids and labels must have matching lengths",
        path: ["playerLabels"],
      });
    }
  });

const scenarioEvidenceSchema = z.discriminatedUnion("kind", [
  z
    .object({ kind: z.literal("PRICE"), value: decimalOddsStringSchema })
    .strict(),
  z.object({ kind: z.literal("LINEUP"), value: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("DECISION"), value: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("QUALITY"), value: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("ABSENCE"), value: z.string().min(1) }).strict(),
]);

const syntheticScenarioSchema = z
  .object({
    id: canonicalUuidSchema,
    state: scenarioStateSchema,
    eventId: canonicalUuidSchema,
    sourceObservationIds: z.array(canonicalUuidSchema),
    providerMarketKey: z.string().min(1).optional(),
    providerOutcomeKey: z.string().min(1).optional(),
    line: marketLineStringSchema.optional(),
    teamId: canonicalUuidSchema.optional(),
    evidence: scenarioEvidenceSchema,
  })
  .strict()
  .superRefine((scenario, context) => {
    if (
      scenario.evidence.kind === "PRICE" &&
      (scenario.providerMarketKey === undefined ||
        scenario.providerOutcomeKey === undefined)
    ) {
      context.addIssue({
        code: "custom",
        message: "Price scenarios require an exact provider market and outcome",
      });
    }
    if (scenario.evidence.kind === "LINEUP" && scenario.teamId === undefined) {
      context.addIssue({
        code: "custom",
        message: "Lineup scenarios require a team identity",
      });
    }
    if (
      scenario.sourceObservationIds.length === 0 &&
      scenario.evidence.kind !== "ABSENCE"
    ) {
      context.addIssue({
        code: "custom",
        message: "Non-absence scenarios require source observation evidence",
      });
    }
  });

export const syntheticSequenceSchema = z
  .object({
    schemaVersion: z.literal("provider-sequence.v1"),
    sequenceName: z.enum([
      "sequence-01-opening",
      "sequence-02-movement",
      "sequence-03-lineup-change",
      "sequence-04-repriced",
    ]),
    contentHash: contentHashSchema,
    synthetic: z.literal(true),
    syntheticLabel: syntheticLabelSchema,
    receivedAt: isoTimestampSchema,
    fixtures: z.array(fixtureObservationSchema),
    odds: z.array(oddsObservationSchema),
    lineups: z.array(lineupObservationSchema),
    scenarios: z.array(syntheticScenarioSchema).min(1).optional(),
    scenarioStates: z.array(scenarioStateSchema).optional(),
  })
  .strict()
  .superRefine((sequence, context) => {
    if (
      (sequence.scenarios === undefined || sequence.scenarios.length === 0) &&
      (sequence.scenarioStates === undefined ||
        sequence.scenarioStates.length === 0)
    ) {
      context.addIssue({
        code: "custom",
        message: "Sequence must declare scenarios or scenario states",
        path: ["scenarios"],
      });
    }
    const sourceObservationIds = new Set<string>();
    for (const observation of [
      ...sequence.fixtures,
      ...sequence.odds,
      ...sequence.lineups,
    ]) {
      if (observation.providerObservedAt > sequence.receivedAt) {
        context.addIssue({
          code: "custom",
          message: "Provider observation time cannot be after receipt",
        });
      }
      if (sourceObservationIds.has(observation.sourceObservationId)) {
        context.addIssue({
          code: "custom",
          message:
            "Source observation identifiers must be unique within a sequence",
        });
      }
      sourceObservationIds.add(observation.sourceObservationId);
    }
    const scenarioIds = new Set<string>();
    for (const scenario of sequence.scenarios ?? []) {
      if (scenarioIds.has(scenario.id)) {
        context.addIssue({
          code: "custom",
          message: "Scenario identifiers must be unique within a sequence",
        });
      }
      scenarioIds.add(scenario.id);
    }
  });

export type SyntheticCatalogDocument = z.infer<
  typeof syntheticCatalogBaseSchema
>;
export type SyntheticSequenceDocument = z.infer<typeof syntheticSequenceSchema>;

type ProviderParseResult<T> =
  | Readonly<{ readonly ok: true; readonly value: T }>
  | Readonly<{
      readonly ok: false;
      readonly error: Readonly<{
        readonly code: "INVALID_PROVIDER_PAYLOAD";
        readonly issues: readonly string[];
      }>;
    }>;

function result<T>(parsed: z.ZodSafeParseResult<T>): ProviderParseResult<T> {
  return parsed.success
    ? { ok: true, value: parsed.data }
    : {
        ok: false,
        error: {
          code: "INVALID_PROVIDER_PAYLOAD",
          issues: parsed.error.issues.map((issue) => issue.message),
        },
      };
}

export function parseSyntheticSequence(
  input: unknown,
): ProviderParseResult<SyntheticSequenceDocument> {
  return result(syntheticSequenceSchema.safeParse(input));
}
