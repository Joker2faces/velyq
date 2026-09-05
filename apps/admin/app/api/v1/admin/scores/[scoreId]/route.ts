import { adminApi } from "../../../../../admin-api";

export async function GET(
  request: Request,
  context: { params: Promise<{ scoreId: string }> },
) {
  return adminApi.getScore(request, await context.params);
}
