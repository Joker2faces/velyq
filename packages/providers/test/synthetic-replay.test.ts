import { describe, expect, it } from "vitest";

import { SyntheticReplaySource } from "../src/index.js";

const sequenceNames = [
  "sequence-01-opening",
  "sequence-02-movement",
  "sequence-03-lineup-change",
  "sequence-04-repriced",
] as const;
const fixedClock = "2026-09-03T11:00:00Z";

describe("synthetic repository replay", () => {
  it("returns byte-identical normalized output and hashes on repeated replay", async () => {
    const source = SyntheticReplaySource.fromRepository();
    const request = { sequenceName: sequenceNames[1], fixedClock };

    const first = await source.replay(request);
    const second = await source.replay(request);

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(first.odds.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("replays exactly the four required versioned sequence files", () => {
    const source = SyntheticReplaySource.fromRepository();
    expect(source.sequenceNames()).toEqual(sequenceNames);
  });

  it("covers the complete Phase 1 scenario matrix", async () => {
    const source = SyntheticReplaySource.fromRepository();
    const states = new Set<string>();

    for (const sequenceName of sequenceNames) {
      const replay = await source.replay({ sequenceName, fixedClock });
      for (const state of replay.scenarioStates) states.add(state);
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
    const source = SyntheticReplaySource.fromRepository();

    for (const sequenceName of sequenceNames) {
      const replay = await source.replay({ sequenceName, fixedClock });
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
    const source = SyntheticReplaySource.fromRepository();
    const replay = await source.replay({
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
    const source = SyntheticReplaySource.fromRepository();
    const replay = await source.replay({
      sequenceName: "sequence-04-repriced",
      fixedClock,
    });

    expect(replay.quarantined).toContainEqual(
      expect.objectContaining({ reason: "UNMAPPED_PROVIDER_MARKET" }),
    );
  });

  it("rejects a replay clock earlier than provider receipt", async () => {
    await expect(
      SyntheticReplaySource.fromRepository().replay({
        sequenceName: "sequence-01-opening",
        fixedClock: "2026-09-03T08:00:00Z",
      }),
    ).rejects.toThrow("FIXED_CLOCK_PRECEDES_RECEIPT");
  });

  it("contains no real-world brand or club identifiers", async () => {
    const serialized = JSON.stringify(
      await SyntheticReplaySource.fromRepository().replay({
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
});
