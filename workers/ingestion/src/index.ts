import {
  InMemoryIngestionSink,
  InMemoryJobRepository,
  ingestProviderSequence,
  type IngestionBatch,
  type IngestionSink,
  type JobRepository,
} from "@velyq/application";

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
