import { eq } from "drizzle-orm";
import type { PrivilegedVelyqDatabase } from "../client.js";
import { providerSyncRuns } from "../schema/operations.js";

export type BeginProviderRunInput = Readonly<{
  providerId: string;
  capability: string;
  sequenceName: string;
  fixturePath: string;
  sourceFixtureHash: string;
  providerSchemaVersion: string;
  normalizationVersion: string;
  mappingVersion: string;
  policyVersionId: string;
  startedAt: Date;
}>;

/** Durable provider-run state; runtime fields are advanced monotonically. */
export class DatabaseProviderRunRepository {
  constructor(private readonly database: PrivilegedVelyqDatabase) {}

  async begin(input: BeginProviderRunInput) {
    const inserted = await this.database
      .insert(providerSyncRuns)
      .values({
        providerId: input.providerId,
        capability: input.capability,
        status: "RUNNING",
        replaySequence: input.sequenceName,
        fixturePath: input.fixturePath,
        contentHash: input.sourceFixtureHash,
        providerSchemaVersion: input.providerSchemaVersion,
        normalizationVersion: input.normalizationVersion,
        mappingVersion: input.mappingVersion,
        policyVersionId: input.policyVersionId,
        startedAt: input.startedAt,
      })
      .returning();
    if (!inserted[0]) throw new Error("PROVIDER_RUN_INSERT_FAILED");
    return inserted[0];
  }

  async complete(
    runId: string,
    input: Readonly<{
      normalizedOutputHash: string;
      receivedCount: number;
      acceptedCount: number;
      rejectedCount: number;
      completedAt: Date;
    }>,
  ) {
    // provider_sync_runs.content_hash is the source fixture hash; normalized
    // output hashes belong to downstream replay/result metadata in Phase 1.
    void input.normalizedOutputHash;
    const updated = await this.database
      .update(providerSyncRuns)
      .set({
        status: "COMPLETED",
        receivedCount: input.receivedCount,
        acceptedCount: input.acceptedCount,
        rejectedCount: input.rejectedCount,
        completedAt: input.completedAt,
      })
      .where(eq(providerSyncRuns.id, runId))
      .returning();
    if (!updated[0]) throw new Error("PROVIDER_RUN_NOT_FOUND");
    return updated[0];
  }

  async fail(
    runId: string,
    errorSummary: Readonly<{ code: string; message: string }>,
    completedAt: Date,
  ) {
    const updated = await this.database
      .update(providerSyncRuns)
      .set({ status: "FAILED", errorSummary, completedAt })
      .where(eq(providerSyncRuns.id, runId))
      .returning();
    if (!updated[0]) throw new Error("PROVIDER_RUN_NOT_FOUND");
    return updated[0];
  }
}
