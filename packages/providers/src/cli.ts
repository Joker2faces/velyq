import { SyntheticReplaySource } from "./replay.js";
import { createProviderPolicyContext } from "./policy.js";

const fixedClock = "2026-09-03T11:00:00Z";
const context = createProviderPolicyContext({
  environment: "DEVELOPMENT",
  territory: "ZZ",
  asOf: fixedClock,
  attributionPresent: true,
});
if (!context.ok) throw new Error("INVALID_PROVIDER_POLICY_CONTEXT");
const source = SyntheticReplaySource.fromRepository(context.value);
const results = await Promise.all(
  source.sequenceNames().map(async (sequenceName) => {
    const replay = await source.replay({ sequenceName, fixedClock });
    return {
      sequenceName,
      contentHash: replay.normalizedOutputHash,
      accepted:
        replay.fixtures.observations.length +
        replay.odds.observations.length +
        replay.lineups.observations.length,
      quarantined: replay.quarantined.length,
      scenarioStates: [...new Set(replay.scenarios.map(({ state }) => state))],
    };
  }),
);

process.stdout.write(`${JSON.stringify({ fixedClock, results })}\n`);
