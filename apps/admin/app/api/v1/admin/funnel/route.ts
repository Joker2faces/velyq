import { adminApi } from "../../../../admin-api";

export const GET = (request: Request) => adminApi.listDecisionFunnel(request);
