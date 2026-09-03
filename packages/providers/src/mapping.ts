import type { ProviderMarketMapping } from "@velyq/contracts";

import { isoTimestampSchema } from "./schemas.js";

export type ProviderMappingLookup = Readonly<{
  readonly providerMarketKey: string;
  readonly providerOutcomeKey: string;
  readonly mappingVersion: string;
}>;

export type ProviderMappingResult =
  | Readonly<{ readonly ok: true; readonly value: ProviderMarketMapping }>
  | Readonly<{
      readonly ok: false;
      readonly reason: "UNMAPPED_PROVIDER_MARKET" | "AMBIGUOUS_PROVIDER_MARKET";
      readonly providerMarketKey: string;
      readonly providerOutcomeKey: string;
    }>;

export function resolveProviderMarketMapping(
  mappings: readonly ProviderMarketMapping[],
  lookup: ProviderMappingLookup,
  observedAt: string,
): ProviderMappingResult {
  if (!isoTimestampSchema.safeParse(observedAt).success) {
    return {
      ok: false,
      reason: "UNMAPPED_PROVIDER_MARKET",
      providerMarketKey: lookup.providerMarketKey,
      providerOutcomeKey: lookup.providerOutcomeKey,
    };
  }

  const candidates = mappings.filter(
    (mapping) =>
      mapping.providerMarketKey === lookup.providerMarketKey &&
      mapping.providerOutcomeKey === lookup.providerOutcomeKey &&
      mapping.mappingVersion === lookup.mappingVersion &&
      mapping.effectiveFrom <= observedAt &&
      (mapping.effectiveTo === null || observedAt < mapping.effectiveTo),
  );

  if (candidates.length === 1) return { ok: true, value: candidates[0]! };

  return {
    ok: false,
    reason:
      candidates.length === 0
        ? "UNMAPPED_PROVIDER_MARKET"
        : "AMBIGUOUS_PROVIDER_MARKET",
    providerMarketKey: lookup.providerMarketKey,
    providerOutcomeKey: lookup.providerOutcomeKey,
  };
}
