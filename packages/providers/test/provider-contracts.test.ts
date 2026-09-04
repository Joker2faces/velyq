import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { FixtureSource, LineupSource, OddsSource } from "@velyq/contracts";

import {
  SyntheticReplaySource,
  createProviderPolicyContext,
  parseSyntheticCatalog,
  parseSyntheticSequence,
  verifySyntheticSequenceContentHash,
} from "../src/index.js";

function testPolicyContext() {
  const parsed = createProviderPolicyContext({
    environment: "TEST",
    territory: "ZZ",
    asOf: "2026-09-03T11:00:00Z",
    attributionPresent: true,
  });
  if (!parsed.ok) throw new Error("test policy context must parse");
  return parsed.value;
}

describe("provider runtime contracts", () => {
  it("implements all three narrow provider capability ports", () => {
    const source = SyntheticReplaySource.fromRepository(testPolicyContext());
    const fixtureSource: FixtureSource = source;
    const oddsSource: OddsSource = source;
    const lineupSource: LineupSource = source;

    expect([fixtureSource, oddsSource, lineupSource]).toHaveLength(3);
  });

  it.each([
    ["bad timestamp", { receivedAt: "2026-02-30T00:00:00Z" }],
    ["numeric decimal", { odds: [{ decimalOdds: 2.1 }] }],
    ["exponent decimal", { odds: [{ decimalOdds: "2.1e0" }] }],
    ["not synthetic", { synthetic: false }],
    ["unlabeled", { syntheticLabel: "" }],
  ])("rejects malformed sequence input: %s", (_name, replacement) => {
    expect(
      parseSyntheticSequence({
        schemaVersion: "provider-sequence.v1",
        sequenceName: "sequence-01-opening",
        contentHash:
          "sha256:0000000000000000000000000000000000000000000000000000000000000000",
        synthetic: true,
        syntheticLabel: "Synthetic data",
        receivedAt: "2026-09-03T09:00:01Z",
        fixtures: [],
        odds: [],
        lineups: [],
        scenarioStates: [],
        ...replacement,
      }),
    ).toEqual(expect.objectContaining({ ok: false }));
  });

  it("rejects an unknown canonical market in the catalog", () => {
    expect(
      parseSyntheticCatalog({
        schemaVersion: "synthetic-catalog.v1",
        synthetic: true,
        syntheticLabel: "Synthetic data",
        provider: {
          id: "30000000-0000-4000-8000-000000000001",
          code: "SYNTHETIC_FIXTURES",
          displayName: "VELYQ Synthetic Fixtures",
        },
        competition: {
          id: "21000000-0000-4000-8000-000000000001",
          code: "SYNTHETIC_LEAGUE",
          displayName: "Synthetic League",
        },
        participants: [],
        bookmakers: [],
        mappingVersion: "mapping.v1",
        mappings: [
          {
            id: "42000000-0000-4000-8000-000000000099",
            providerMarketKey: "mystery",
            providerOutcomeKey: "home",
            canonicalDefinitionCode: "REAL_WORLD_MARKET",
            canonicalOutcomeCode: "HOME",
            mappingVersion: "mapping.v1",
            effectiveFrom: "2026-01-01T00:00:00Z",
            effectiveTo: null,
          },
        ],
        policy: {},
      }),
    ).toEqual(expect.objectContaining({ ok: false }));
  });

  it("detects sequence fixture drift against the declared content hash", () => {
    const raw = JSON.parse(
      readFileSync(
        new URL(
          "../src/mock/fixtures/v1/sequence-01-opening.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ) as Record<string, unknown>;

    expect(verifySyntheticSequenceContentHash(raw)).toBe(true);
    expect(
      verifySyntheticSequenceContentHash({
        ...raw,
        receivedAt: "2026-09-03T09:00:02Z",
      }),
    ).toBe(false);
  });

  it("rejects provider observation timestamps after receipt", () => {
    const raw = JSON.parse(
      readFileSync(
        new URL(
          "../src/mock/fixtures/v1/sequence-01-opening.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ) as Record<string, unknown>;
    const odds = raw["odds"] as Array<Record<string, unknown>>;
    const first = odds[0]!;

    expect(
      parseSyntheticSequence({
        ...raw,
        odds: [
          { ...first, providerObservedAt: "2026-09-03T09:00:02Z" },
          ...odds.slice(1),
        ],
      }),
    ).toEqual(expect.objectContaining({ ok: false }));
  });

  it("rejects a malformed market-line decimal before normalization", () => {
    const raw = JSON.parse(
      readFileSync(
        new URL(
          "../src/mock/fixtures/v1/sequence-01-opening.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ) as Record<string, unknown>;
    const odds = raw["odds"] as Array<Record<string, unknown>>;
    const total = odds[3]!;

    expect(
      parseSyntheticSequence({
        ...raw,
        odds: [
          ...odds.slice(0, 3),
          { ...total, line: "2.5e0" },
          ...odds.slice(4),
        ],
      }),
    ).toEqual(expect.objectContaining({ ok: false }));
  });

  it("rejects arbitrary player labels and unknown player identities", () => {
    const raw = JSON.parse(
      readFileSync(
        new URL(
          "../src/mock/fixtures/v1/sequence-01-opening.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ) as Record<string, unknown>;
    const lineups = raw["lineups"] as Array<Record<string, unknown>>;

    expect(
      parseSyntheticSequence({
        ...raw,
        lineups: [
          {
            ...lineups[0],
            playerIds: ["22000000-0000-4000-8000-000000009999"],
            playerLabels: ["Famous Real Player"],
          },
          ...lineups.slice(1),
        ],
      }),
    ).toEqual(expect.objectContaining({ ok: false }));
  });
});
