import { SyntheticReplaySource } from "./replay.js";

const fixedClock = "2026-09-03T11:00:00Z";
const source = SyntheticReplaySource.fromRepository();
const results = await Promise.all(
  source.sequenceNames().map(async (sequenceName) => {
    const replay = await source.replay({ sequenceName, fixedClock });
    return {
      sequenceName,
      contentHash: replay.contentHash,
      accepted:
        replay.fixtures.observations.length +
        replay.odds.observations.length +
        replay.lineups.observations.length,
      quarantined: replay.quarantined.length,
      scenarioStates: replay.scenarioStates,
    };
  }),
);

process.stdout.write(`${JSON.stringify({ fixedClock, results })}\n`);
