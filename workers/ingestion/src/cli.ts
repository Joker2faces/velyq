import { SyntheticReplaySource } from "@velyq/providers";
import { createProviderPolicyContext } from "@velyq/providers";
import { runIngestion } from "./index.js";

const args = process.argv.slice(2).filter((argument) => argument !== "--");
const fixedClock = args[0] ?? "2026-09-03T11:00:00Z";
const requestedSequence = args[1];
const context = createProviderPolicyContext({
  environment: "DEVELOPMENT",
  territory: "ZZ",
  asOf: fixedClock,
  attributionPresent: true,
});
if (!context.ok) throw new Error("INVALID_PROVIDER_POLICY_CONTEXT");
const source = SyntheticReplaySource.fromRepository(context.value);
const sequences = requestedSequence
  ? [requestedSequence]
  : source.sequenceNames();
const results = await Promise.all(
  sequences.map(async (sequenceName) => {
    const result = await runIngestion(sequenceName, fixedClock, source);
    return {
      sequenceName,
      fixedClock,
      accepted: result.accepted,
      rejected: result.rejected,
      duplicate: result.duplicate,
      downstreamJobs: result.downstreamJobs.length,
    };
  }),
);
process.stdout.write(`${JSON.stringify({ results })}\n`);
