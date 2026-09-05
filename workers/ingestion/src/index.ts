import {
  InMemoryIngestionSink,
  InMemoryJobRepository,
  ingestProviderSequence,
  type IngestionBatch,
  type IngestionSink,
  type JobRepository,
} from "@velyq/application";
import { createHash } from "node:crypto";
import {
  DatabaseProviderRunRepository,
  DatabaseTransactionalIngestionSink,
  type PrivilegedVelyqDatabase,
} from "@velyq/database";

function stableUuid(seed: string) {
  const hex = createHash("sha256").update(seed).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`;
}

export async function runDurableIngestion(
  sequenceName: string,
  fixedClock: string,
  source: Readonly<{
    replay(request: {
      sequenceName: string;
      fixedClock: string;
    }): Promise<IngestionBatch>;
  }>,
  config: Readonly<{
    database: PrivilegedVelyqDatabase;
    providerId: string;
    policyVersionId: string;
    qualityPolicyVersionId: string;
    fixturePath: string;
  }>,
) {
  const batch = await source.replay({ sequenceName, fixedClock });
  const runs = new DatabaseProviderRunRepository(config.database);
  const run = await runs.begin({
    providerId: config.providerId,
    capability: "ODDS",
    sequenceName,
    fixturePath: config.fixturePath,
    sourceFixtureHash: batch.fixtures.sourceFixtureHash,
    providerSchemaVersion: batch.fixtures.schemaVersion,
    normalizationVersion: batch.fixtures.normalizationVersion,
    mappingVersion: batch.fixtures.mappingVersion,
    policyVersionId: config.policyVersionId,
    startedAt: new Date(fixedClock),
  });
  const sink = new DatabaseTransactionalIngestionSink(config.database, {
    providerId: config.providerId,
    qualityPolicyVersionId: config.qualityPolicyVersionId,
    runId: run.id,
    providerCode: batch.fixtures.providerCode,
    sequenceName,
    fixedClock,
  });
  try {
    return await ingestProviderSequence({
      sequenceName,
      fixedClock,
      source: { replay: async () => batch },
      sink,
      qualityPolicyVersionId: config.qualityPolicyVersionId,
      correlationId: stableUuid(`ingestion:${sequenceName}:${fixedClock}`),
      causationId: stableUuid(`replay:${sequenceName}`),
    });
  } catch (error) {
    await runs.fail(
      run.id,
      {
        code: error instanceof Error ? error.message : "INGESTION_FAILED",
        message: "Durable ingestion transaction failed.",
      },
      new Date(fixedClock),
    );
    throw error;
  }
}

export async function runIngestion(
  sequenceName: string,
  fixedClock: string,
  source: Readonly<{
    replay(request: {
      sequenceName: string;
      fixedClock: string;
    }): Promise<IngestionBatch>;
  }>,
  dependencies: Readonly<{
    sink: IngestionSink;
    jobs: JobRepository;
  }> = {
    sink: new InMemoryIngestionSink(),
    jobs: new InMemoryJobRepository({ now: () => fixedClock }),
  },
) {
  return ingestProviderSequence({
    sequenceName,
    fixedClock,
    source,
    sink: dependencies.sink,
    jobs: dependencies.jobs,
    correlationId: `ingestion:${sequenceName}:${fixedClock}`,
    causationId: `replay:${sequenceName}`,
  });
}
