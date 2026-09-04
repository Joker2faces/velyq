import { describe, expect, it } from "vitest";

import {
  SyntheticReplaySource,
  createProviderPolicyContext,
} from "../src/index.js";

const sequenceNames = [
  "sequence-01-opening",
  "sequence-02-movement",
  "sequence-03-lineup-change",
  "sequence-04-repriced",
] as const;
const fixedClock = "2026-09-03T11:00:00Z";

function policyContext(overrides: Readonly<Record<string, unknown>> = {}) {
  const parsed = createProviderPolicyContext({
    environment: "TEST",
    territory: "ZZ",
    asOf: fixedClock,
    attributionPresent: true,
    ...overrides,
  });
  if (!parsed.ok) throw new Error("policy context must parse");
  return parsed.value;
}

function source(
  overrides: Readonly<Record<string, unknown>> = {},
): SyntheticReplaySource {
  return SyntheticReplaySource.fromRepository(policyContext(overrides));
}

describe("synthetic repository replay", () => {
  it("returns byte-identical normalized output and hashes on repeated replay", async () => {
    const replaySource = source();
    const request = { sequenceName: sequenceNames[1], fixedClock };

    const first = await replaySource.replay(request);
    const second = await replaySource.replay(request);

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.sourceFixtureHash).toBe(
      "sha256:150cfd25a412920149808f1c919773ea606f05c9c17193bce96d9ca22cf5ac2e",
    );
    expect(first.normalizedOutputHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(first.normalizedOutputHash).not.toBe(first.sourceFixtureHash);
    expect(first.odds.sourceFixtureHash).toBe(first.sourceFixtureHash);
    expect(first.odds.normalizedOutputHash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("replays exactly the four required versioned sequence files", () => {
    expect(source().sequenceNames()).toEqual(sequenceNames);
  });

  it("keeps source observation hashes byte-exact across replay", async () => {
    const expected = new Map([
      [
        "73000000-0000-4000-8000-000000000011",
        "sha256:8d94a020f516fa75d92e5163670b85930b7ce8675baabc3578fa32c47c684e05",
      ],
      [
        "73000000-0000-4000-8000-000000000012",
        "sha256:e686874f9dbc6be96bc268c7f770ccc5df12f43322997abe53f7a2db2fd6acf0",
      ],
    ]);

    const replay = await source().replay({
      sequenceName: "sequence-03-lineup-change",
      fixedClock,
    });

    for (const observation of replay.lineups.observations) {
      expect(expected.get(observation.provenance.sourceObservationId)).toBe(
        observation.provenance.sourceObservationHash,
      );
    }
  });

  it("covers the complete Phase 1 scenario matrix", async () => {
    const replaySource = source();
    const states = new Set<string>();

    for (const sequenceName of sequenceNames) {
      const replay = await replaySource.replay({ sequenceName, fixedClock });
      for (const scenario of replay.scenarios) {
        states.add(scenario.state);
        expect(scenario.eventId).toMatch(/^[0-9a-f-]{36}$/);
        expect(scenario.sourceObservationIds.length).toBeGreaterThan(0);
        if (scenario.evidence.kind === "PRICE") {
          expect(scenario.marketKey).toContain("market-key-v1");
          expect(scenario.outcomeKey).toContain("outcome=");
          expect(scenario.evidence.value).toMatch(/^\d+(?:\.\d+)?$/);
        }
      }
    }

    expect([...states].sort()).toEqual(
      [
        "CHANGED_LINEUP",
        "CURRENT_PRICE",
        "EDGE_DISAPPEARED",
        "EXPECTED_LINEUP",
        "INSUFFICIENT_DATA",
        "MISSING_LINEUP",
        "MISSING_PRICE",
        "NO_BET",
        "OFFICIAL_LINEUP",
        "OPENING_PRICE",
        "RADAR_MOVEMENT",
        "STALE_PRICE",
        "STRONG_EDGE",
        "WAIT_FOR_LINEUP",
      ].sort(),
    );
  });

  it("keeps synthetic provenance permanent on every normalized DTO", async () => {
    const replaySource = source();

    for (const sequenceName of sequenceNames) {
      const replay = await replaySource.replay({ sequenceName, fixedClock });
      for (const batch of [replay.fixtures, replay.odds, replay.lineups]) {
        expect(batch.isSynthetic).toBe(true);
        expect(batch.syntheticLabel).toBe("Synthetic data");
        for (const observation of batch.observations) {
          expect(observation.isSynthetic).toBe(true);
          expect(observation.syntheticLabel).toBe("Synthetic data");
          expect(observation.provenance.isSynthetic).toBe(true);
          expect(observation.provenance.syntheticLabel).toBe("Synthetic data");
        }
      }
    }
  });

  it("includes multiple fictional events, bookmakers, 1X2 and total 2.5 prices", async () => {
    const replay = await source().replay({
      sequenceName: "sequence-01-opening",
      fixedClock,
    });

    expect(
      new Set(replay.fixtures.observations.map(({ eventId }) => eventId)).size,
    ).toBeGreaterThan(1);
    expect(
      new Set(replay.odds.observations.map(({ bookmakerId }) => bookmakerId))
        .size,
    ).toBeGreaterThan(1);
    expect(
      new Set(
        replay.odds.observations.map(
          ({ marketDefinitionCode }) => marketDefinitionCode,
        ),
      ),
    ).toEqual(new Set(["FOOTBALL_FULL_TIME_1X2", "FOOTBALL_FULL_TIME_TOTAL"]));
    expect(
      replay.odds.observations
        .filter(
          ({ marketDefinitionCode }) =>
            marketDefinitionCode === "FOOTBALL_FULL_TIME_TOTAL",
        )
        .every(({ line }) => line?.value === "2.5"),
    ).toBe(true);
  });

  it("quarantines unknown market keys with an explicit reason", async () => {
    const replaySource = source();
    const replay = await replaySource.replay({
      sequenceName: "sequence-04-repriced",
      fixedClock,
    });

    const quarantined = replay.quarantined[0]!;
    expect(quarantined.reason).toBe("UNMAPPED_PROVIDER_MARKET");
    expect(quarantined.provenance).toEqual(
      expect.objectContaining({
        providerId: "30000000-0000-4000-8000-000000000001",
        ingestionRunId: "32000000-0000-4000-8000-000000000004",
        sourceFixtureHash: replay.sourceFixtureHash,
        mappingVersion: "mapping.v1",
        fixturePath:
          "packages/providers/src/mock/fixtures/v1/sequence-04-repriced.json",
      }),
    );

    const oddsResult = await replaySource.listOddsObservations({
      sequenceName: "sequence-04-repriced",
      fixedClock,
    });
    expect(oddsResult.batch.observations).toHaveLength(1);
    expect(oddsResult.quarantined).toHaveLength(1);
  });

  it("rejects a replay clock earlier than provider receipt", async () => {
    await expect(
      source().replay({
        sequenceName: "sequence-01-opening",
        fixedClock: "2026-09-03T08:00:00Z",
      }),
    ).rejects.toThrow("FIXED_CLOCK_PRECEDES_RECEIPT");
  });

  it("contains no real-world brand or club identifiers", async () => {
    const serialized = JSON.stringify(
      await source().replay({
        sequenceName: "sequence-01-opening",
        fixedClock,
      }),
    ).toLowerCase();

    for (const forbidden of [
      "bet365",
      "pinnacle",
      "william hill",
      "arsenal",
      "barcelona",
      "real madrid",
      "uefa",
      "fifa",
      "premier league",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("requires explicitly injected policy context and denies production replay", async () => {
    await expect(
      source({ environment: "PRODUCTION" }).replay({
        sequenceName: "sequence-01-opening",
        fixedClock,
      }),
    ).rejects.toThrow("POLICY_DENIED:CACHE:ENVIRONMENT_NOT_GRANTED");

    await expect(
      source({ attributionPresent: false }).replay({
        sequenceName: "sequence-01-opening",
        fixedClock,
      }),
    ).rejects.toThrow("POLICY_DENIED:CACHE:ATTRIBUTION_REQUIRED");
  });

  it("does not expose mutable aliases for internal or returned replay state", async () => {
    const replaySource = source();
    const names = replaySource.sequenceNames() as string[];
    expect(() => names.push("forged-sequence")).toThrow();

    const replay = await replaySource.replay({
      sequenceName: "sequence-01-opening",
      fixedClock,
    });
    const mutable = replay as unknown as {
      odds: { observations: Array<{ scenarioStates: string[] }> };
    };
    expect(() =>
      mutable.odds.observations[0]!.scenarioStates.push("FORGED"),
    ).toThrow();

    const repeated = await replaySource.replay({
      sequenceName: "sequence-01-opening",
      fixedClock,
    });
    expect(JSON.stringify(repeated)).toBe(JSON.stringify(replay));
  });

  it("normalizes only catalog-backed synthetic player identities", async () => {
    const replay = await source().replay({
      sequenceName: "sequence-01-opening",
      fixedClock,
    });
    const players = replay.lineups.observations.flatMap(
      ({ players }) => players,
    );

    expect(players.length).toBeGreaterThan(0);
    for (const player of players) {
      expect(player.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(player.displayName).toContain("(Synthetic)");
      expect(player.isSynthetic).toBe(true);
      expect(player.syntheticLabel).toBe("Synthetic data");
    }
  });
});
