import { adminApi } from "../../../../../admin-api";

export async function GET(
  request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  return adminApi.getProviderRun(request, await context.params);
}
