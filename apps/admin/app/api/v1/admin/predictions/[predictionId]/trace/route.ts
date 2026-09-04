import { adminApi } from "../../../../../../admin-api";

export async function GET(
  request: Request,
  context: { params: Promise<{ predictionId: string }> },
) {
  return adminApi.getPredictionTrace(request, await context.params);
}
