import { notFound } from "next/navigation";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function loadProviderIngestionRun<T>(
  runId: string,
  getRun: (runId: string) => Promise<T>,
): Promise<T> {
  if (!UUID_PATTERN.test(runId)) notFound();
  try {
    return await getRun(runId);
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") notFound();
    throw error;
  }
}
