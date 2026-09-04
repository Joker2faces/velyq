import {
  InMemoryIngestionSink,
  InMemoryJobRepository,
  ingestProviderSequence,
  type IngestionBatch,
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
) {
  const sink = new InMemoryIngestionSink();
  const jobs = new InMemoryJobRepository({ now: () => fixedClock });
  return ingestProviderSequence({
    sequenceName,
    fixedClock,
    source,
    sink,
    jobs,
    correlationId: `ingestion:${sequenceName}:${fixedClock}`,
    causationId: `replay:${sequenceName}`,
  });
}
