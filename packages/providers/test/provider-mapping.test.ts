import { describe, expect, it } from "vitest";

import type { ProviderMarketMapping } from "@velyq/contracts";

import { resolveProviderMarketMapping } from "../src/index.js";

const baseMapping: ProviderMarketMapping = {
  id: "42000000-0000-4000-8000-000000000001",
  providerMarketKey: "ft_1x2",
  providerOutcomeKey: "home",
  canonicalDefinitionCode: "FOOTBALL_FULL_TIME_1X2",
  canonicalOutcomeCode: "HOME",
  mappingVersion: "mapping.v1",
  effectiveFrom: "2026-01-01T00:00:00Z",
  effectiveTo: null,
};

describe("provider market mapping", () => {
  it("resolves one effective versioned mapping exactly", () => {
    expect(
      resolveProviderMarketMapping(
        [baseMapping],
        {
          providerMarketKey: "ft_1x2",
          providerOutcomeKey: "home",
          mappingVersion: "mapping.v1",
        },
        "2026-09-03T09:00:00Z",
      ),
    ).toEqual({ ok: true, value: baseMapping });
  });

  it("quarantines an unmapped provider market without guessing", () => {
    expect(
      resolveProviderMarketMapping(
        [baseMapping],
        {
          providerMarketKey: "ft_1x2",
          providerOutcomeKey: "visitor",
          mappingVersion: "mapping.v1",
        },
        "2026-09-03T09:00:00Z",
      ),
    ).toEqual({
      ok: false,
      reason: "UNMAPPED_PROVIDER_MARKET",
      providerMarketKey: "ft_1x2",
      providerOutcomeKey: "visitor",
    });
  });

  it("quarantines duplicate effective mappings as ambiguous", () => {
    expect(
      resolveProviderMarketMapping(
        [
          baseMapping,
          {
            ...baseMapping,
            id: "42000000-0000-4000-8000-000000000099",
          },
        ],
        {
          providerMarketKey: "ft_1x2",
          providerOutcomeKey: "home",
          mappingVersion: "mapping.v1",
        },
        "2026-09-03T09:00:00Z",
      ),
    ).toEqual({
      ok: false,
      reason: "AMBIGUOUS_PROVIDER_MARKET",
      providerMarketKey: "ft_1x2",
      providerOutcomeKey: "home",
    });
  });

  it.each([
    ["invalid UUID", { ...baseMapping, id: "not-a-uuid" }],
    [
      "impossible outcome binding",
      {
        ...baseMapping,
        canonicalDefinitionCode: "FOOTBALL_FULL_TIME_1X2",
        canonicalOutcomeCode: "OVER",
      },
    ],
  ])("rejects an unvalidated mapping document: %s", (_name, mapping) => {
    expect(
      resolveProviderMarketMapping(
        [mapping],
        {
          providerMarketKey: "ft_1x2",
          providerOutcomeKey: "home",
          mappingVersion: "mapping.v1",
        },
        "2026-09-03T09:00:00Z",
      ),
    ).toEqual({
      ok: false,
      reason: "INVALID_MAPPING_DOCUMENT",
      providerMarketKey: "ft_1x2",
      providerOutcomeKey: "home",
    });
  });
});
