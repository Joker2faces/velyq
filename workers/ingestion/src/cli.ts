import { SyntheticReplaySource } from "@velyq/providers";
import { createProviderPolicyContext } from "@velyq/providers";
import { createPrivilegedDatabaseClient } from "@velyq/database";
import { runDurableIngestion, runIngestion } from "./index.js";

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
const databaseUrl = process.env["VELYQ_DATABASE_URL"];
const providerId = process.env["VELYQ_PROVIDER_ID"];
const policyVersionId = process.env["VELYQ_PROVIDER_POLICY_VERSION_ID"];
const qualityPolicyVersionId = process.env["VELYQ_QUALITY_POLICY_VERSION_ID"];
const fixturePath = process.env["VELYQ_FIXTURE_PATH"] ?? "synthetic-replay";
if (
  databaseUrl &&
  (!providerId || !policyVersionId || !qualityPolicyVersionId)
) {
  throw new Error(
    "VELYQ_PROVIDER_ID, VELYQ_PROVIDER_POLICY_VERSION_ID, and VELYQ_QUALITY_POLICY_VERSION_ID are required when VELYQ_DATABASE_URL is configured",
  );
}
const databaseClient = databaseUrl
  ? createPrivilegedDatabaseClient({ connectionString: databaseUrl })
  : null;
const sequences = requestedSequence
  ? [requestedSequence]
  : source.sequenceNames();
const results = await Promise.all(
  sequences.map(async (sequenceName) => {
    const result = databaseClient
      ? await runDurableIngestion(sequenceName, fixedClock, source, {
          database: databaseClient.database,
          providerId: providerId!,
          policyVersionId: policyVersionId!,
          qualityPolicyVersionId: qualityPolicyVersionId!,
          fixturePath,
        })
      : await runIngestion(sequenceName, fixedClock, source);
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
await databaseClient?.close();
process.stdout.write(`${JSON.stringify({ results })}\n`);
