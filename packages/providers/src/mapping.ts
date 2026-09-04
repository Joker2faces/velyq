import type { ProviderMarketMapping } from "@velyq/contracts";
import { z } from "zod";

import { isoTimestampSchema, providerMarketMappingSchema } from "./schemas.js";

export type ProviderMappingLookup = Readonly<{
  readonly providerMarketKey: string;
  readonly providerOutcomeKey: string;
  readonly mappingVersion: string;
}>;

export type ProviderMappingResult =
  | Readonly<{ readonly ok: true; readonly value: ProviderMarketMapping }>
  | Readonly<{
      readonly ok: false;
      readonly reason:
        | "INVALID_MAPPING_DOCUMENT"
        | "UNMAPPED_PROVIDER_MARKET"
        | "AMBIGUOUS_PROVIDER_MARKET";
      readonly providerMarketKey: string;
      readonly providerOutcomeKey: string;
    }>;

export function resolveProviderMarketMapping(
  mappingsInput: unknown,
  lookupInput: unknown,
  observedAtInput: unknown,
): ProviderMappingResult {
  const mappings = z
    .array(providerMarketMappingSchema)
    .safeParse(mappingsInput);
  const lookup = z
    .object({
      providerMarketKey: z.string().min(1),
      providerOutcomeKey: z.string().min(1),
      mappingVersion: z.string().min(1),
    })
    .strict()
    .safeParse(lookupInput);
  const observedAt = isoTimestampSchema.safeParse(observedAtInput);
  const fallbackLookup =
    typeof lookupInput === "object" && lookupInput !== null
      ? lookupInput
      : Object.create(null);
  const providerMarketKey =
    "providerMarketKey" in fallbackLookup &&
    typeof fallbackLookup.providerMarketKey === "string"
      ? fallbackLookup.providerMarketKey
      : "";
  const providerOutcomeKey =
    "providerOutcomeKey" in fallbackLookup &&
    typeof fallbackLookup.providerOutcomeKey === "string"
      ? fallbackLookup.providerOutcomeKey
      : "";

  if (!mappings.success || !lookup.success || !observedAt.success) {
    return {
      ok: false,
      reason: "INVALID_MAPPING_DOCUMENT",
      providerMarketKey,
      providerOutcomeKey,
    };
  }

  const candidates = mappings.data.filter(
    (mapping) =>
      mapping.providerMarketKey === lookup.data.providerMarketKey &&
      mapping.providerOutcomeKey === lookup.data.providerOutcomeKey &&
      mapping.mappingVersion === lookup.data.mappingVersion &&
      mapping.effectiveFrom <= observedAt.data &&
      (mapping.effectiveTo === null || observedAt.data < mapping.effectiveTo),
  );

  if (candidates.length === 1) return { ok: true, value: candidates[0]! };

  return {
    ok: false,
    reason:
      candidates.length === 0
        ? "UNMAPPED_PROVIDER_MARKET"
        : "AMBIGUOUS_PROVIDER_MARKET",
    providerMarketKey: lookup.data.providerMarketKey,
    providerOutcomeKey: lookup.data.providerOutcomeKey,
  };
}
