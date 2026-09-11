import { adminApi } from "../../../../../admin-api";

export async function GET(
  request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  return adminApi.getProviderIngestionRun(request, await context.params);
}
