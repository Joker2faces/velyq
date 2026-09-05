import { adminApi } from "../../../../../admin-api";

export async function GET(
  request: Request,
  context: { params: Promise<{ assessmentId: string }> },
) {
  return adminApi.getQuality(request, await context.params);
}
