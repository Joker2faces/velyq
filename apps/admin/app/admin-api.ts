import { NextResponse } from "next/server";
import {
  hasAdminPermission,
  type PermissionCode,
  type Principal,
} from "@velyq/auth";
import type { ProviderRun } from "@velyq/contracts";
import { createDatabaseAdminRuntime } from "./database-admin";

export type AdminJsonValue =
  | string
  | number
  | boolean
  | null
  | readonly AdminJsonValue[]
  | { readonly [key: string]: AdminJsonValue };

export type AdminProblemDetails = Readonly<{
  type: string;
  title: string;
  status: number;
  code: string;
  requestId: string;
}>;

export type AdminPredictionTraceDto = Readonly<{
  predictionId: string;
  predictionRunId: string;
  eventId: string;
  eventMarketOutcomeId: string;
  modelVersionId: string;
  calibrationVersionId: string;
  featureCutoff: string;
  status: string;
  decisionStatus: string;
  modelProbability: string | null;
  confidence: string | null;
  fairOdds: string | null;
  marketImpliedProbability: string | null;
  edge: string | null;
  expectedValue: string | null;
  reasonCodes: readonly string[];
  structuredReasons: AdminJsonValue;
  sourceObservationIds: readonly string[];
  dataQualityAssessmentId: string;
  marketPriceObservationId: string | null;
  createdAt: string;
}>;

export type AdminScoreDto = Readonly<{
  id: string;
  scoreDefinitionVersionId: string;
  scoreType: "EDGE" | "RADAR";
  validationStatus: "DEVELOPMENT_HEURISTIC";
  predictionId: string | null;
  eventMarketOutcomeId: string;
  dataQualityAssessmentId: string;
  asOf: string;
  score: string;
  components: AdminJsonValue;
  weights: AdminJsonValue;
  capsPenalties: AdminJsonValue;
  reasonCodes: readonly string[];
  createdAt: string;
}>;

export type AdminQualityDto = Readonly<{
  id: string;
  policyVersionId: string;
  eventId: string;
  marketOutcomeId: string | null;
  asOf: string;
  grade: string;
  numericScore: string;
  components: AdminJsonValue;
  reasonCodes: readonly string[];
  createdAt: string;
}>;

export type AdminAuditEventDto = Readonly<{
  id: string;
  actorUserId: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  requestId: string;
  occurredAt: string;
  metadata: AdminJsonValue;
}>;

export type AdminPage<T> = Readonly<{
  items: readonly T[];
  nextCursor: string | null;
}>;

export type AdminQueries = Readonly<{
  listProviderRuns(
    input: Readonly<{ limit: number; cursor: string | null }>,
  ): Promise<AdminPage<ProviderRun>>;
  getProviderRun(runId: string): Promise<ProviderRun>;
  getPredictionTrace(predictionId: string): Promise<AdminPredictionTraceDto>;
  getScore(scoreId: string): Promise<AdminScoreDto>;
  getQuality(assessmentId: string): Promise<AdminQualityDto>;
  listAudit(
    input: Readonly<{ limit: number; cursor: string | null }>,
  ): Promise<AdminPage<AdminAuditEventDto>>;
}>;

type AuthenticationResult =
  | Readonly<{ principal: Principal }>
  | Readonly<{ problem: AdminProblemDetails }>;

export type AdminDependencies = Readonly<{
  authenticate(
    request: Request,
    requestId: string,
  ): Promise<AuthenticationResult>;
  queries: AdminQueries;
}>;

const PROBLEM_BASE = "https://velyq.dev/problems/";
const permissionByOperation = {
  providerRunsRead: "provider_runs.read",
  predictionTrace: "predictions.trace",
  scoreInspect: "scores.inspect",
  qualityInspect: "quality.inspect",
  auditRead: "audit.read",
} as const satisfies Record<string, PermissionCode>;

function problem(
  requestId: string,
  status: number,
  code: string,
  title: string,
): AdminProblemDetails {
  return Object.freeze({
    type: `${PROBLEM_BASE}${code.toLowerCase().replaceAll("_", "-")}`,
    title,
    status,
    code,
    requestId,
  });
}

export function adminProblemResponse(details: AdminProblemDetails) {
  return NextResponse.json(details, {
    status: details.status,
    headers: { "content-type": "application/problem+json" },
  });
}

export function adminRequestId(request: Request) {
  const value = request.headers.get("x-request-id");
  return value && /^[A-Za-z0-9._:-]{1,128}$/.test(value)
    ? value
    : crypto.randomUUID();
}

export function adminRedirectUrl(request: Request, pathname: string) {
  const configured = process.env["VELYQ_APPLICATION_ORIGIN"]?.trim();
  if (configured) {
    try {
      const origin = new URL(configured);
      if (
        (origin.protocol === "https:" || origin.protocol === "http:") &&
        !origin.username &&
        !origin.password
      )
        return new URL(pathname, origin.origin);
    } catch {
      // A malformed configured origin must fail closed.
    }
    return null;
  }
  try {
    const requestOrigin = new URL(request.headers.get("origin") ?? request.url);
    const originIsLocal =
      requestOrigin.hostname === "localhost" ||
      requestOrigin.hostname === "127.0.0.1" ||
      requestOrigin.hostname === "[::1]";
    const incoming = originIsLocal ? requestOrigin : new URL(request.url);
    const localOrigin =
      incoming.hostname === "localhost" ||
      incoming.hostname === "127.0.0.1" ||
      incoming.hostname === "[::1]";
    const trustedEnvironment =
      process.env["NODE_ENV"] !== "production" || localOrigin;
    return trustedEnvironment &&
      (incoming.protocol === "https:" || incoming.protocol === "http:")
      ? new URL(pathname, incoming.origin)
      : null;
  } catch {
    return null;
  }
}

function idFromParams(
  params: Readonly<Record<string, string | undefined>>,
  name: string,
) {
  const value = params[name];
  return value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
    ? value
    : null;
}

function pageInput(request: Request, requestId: string) {
  const url = new URL(request.url);
  const rawLimit = url.searchParams.get("limit");
  const limit = rawLimit === null ? 50 : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    return {
      problem: problem(
        requestId,
        400,
        "INVALID_REQUEST",
        "Invalid pagination input",
      ),
    } as const;
  }
  const cursor = url.searchParams.get("cursor");
  if (
    cursor !== null &&
    (cursor.length === 0 || cursor.length > 256 || !/^\d+$/.test(cursor))
  ) {
    return {
      problem: problem(
        requestId,
        400,
        "INVALID_REQUEST",
        "Invalid pagination cursor",
      ),
    } as const;
  }
  return { limit, cursor } as const;
}

class AdminRequestError extends Error {
  constructor(readonly title: string) {
    super("INVALID_REQUEST");
  }
}

function mapQueryError(error: unknown, requestId: string) {
  if (error instanceof AdminRequestError) {
    return problem(requestId, 400, "INVALID_REQUEST", error.title);
  }
  const code = error instanceof Error ? error.message : "QUERY_FAILED";
  if (code === "NOT_FOUND")
    return problem(requestId, 404, "NOT_FOUND", "Resource not found");
  return problem(
    requestId,
    503,
    "DEPENDENCY_UNAVAILABLE",
    "Admin data is temporarily unavailable",
  );
}

async function authorized(
  dependencies: AdminDependencies,
  request: Request,
  permission: PermissionCode,
  requestId: string,
) {
  const authentication = await dependencies.authenticate(request, requestId);
  if ("problem" in authentication) return authentication.problem;
  if (!hasAdminPermission(authentication.principal, permission)) {
    return problem(requestId, 403, "FORBIDDEN", "Admin permission required");
  }
  return authentication.principal;
}

export function createAdminApi(dependencies: AdminDependencies) {
  async function run<T>(
    request: Request,
    permission: PermissionCode,
    query: (principal: Principal, requestId: string) => Promise<T>,
  ) {
    const requestId = adminRequestId(request);
    const access = await authorized(
      dependencies,
      request,
      permission,
      requestId,
    );
    if ("status" in access) return adminProblemResponse(access);
    try {
      return NextResponse.json(await query(access, requestId), {
        headers: { "x-request-id": requestId },
      });
    } catch (error) {
      return adminProblemResponse(mapQueryError(error, requestId));
    }
  }

  return Object.freeze({
    listProviderRuns: (request: Request) =>
      run(request, permissionByOperation.providerRunsRead, async () => {
        const requestId = adminRequestId(request);
        const input = pageInput(request, requestId);
        if ("problem" in input)
          throw new AdminRequestError(input.problem.title);
        return dependencies.queries.listProviderRuns(input);
      }),
    getProviderRun: (
      request: Request,
      params: Readonly<Record<string, string | undefined>>,
    ) =>
      run(request, permissionByOperation.providerRunsRead, async () => {
        const id = idFromParams(params, "runId");
        if (!id) throw new AdminRequestError("Invalid provider run id");
        return dependencies.queries.getProviderRun(id);
      }),
    getPredictionTrace: (
      request: Request,
      params: Readonly<Record<string, string | undefined>>,
    ) =>
      run(request, permissionByOperation.predictionTrace, async () => {
        const id = idFromParams(params, "predictionId");
        if (!id) throw new AdminRequestError("Invalid prediction id");
        return dependencies.queries.getPredictionTrace(id);
      }),
    getScore: (
      request: Request,
      params: Readonly<Record<string, string | undefined>>,
    ) =>
      run(request, permissionByOperation.scoreInspect, async () => {
        const id = idFromParams(params, "scoreId");
        if (!id) throw new AdminRequestError("Invalid score id");
        return dependencies.queries.getScore(id);
      }),
    getQuality: (
      request: Request,
      params: Readonly<Record<string, string | undefined>>,
    ) =>
      run(request, permissionByOperation.qualityInspect, async () => {
        const id = idFromParams(params, "assessmentId");
        if (!id) throw new AdminRequestError("Invalid assessment id");
        return dependencies.queries.getQuality(id);
      }),
    listAudit: (request: Request) =>
      run(request, permissionByOperation.auditRead, async () => {
        const requestId = adminRequestId(request);
        const input = pageInput(request, requestId);
        if ("problem" in input)
          throw new AdminRequestError(input.problem.title);
        return dependencies.queries.listAudit(input);
      }),
  });
}

const unavailableQueries: AdminQueries = Object.freeze({
  async listProviderRuns() {
    throw new Error("QUERY_ADAPTER_UNAVAILABLE");
  },
  async getProviderRun() {
    throw new Error("QUERY_ADAPTER_UNAVAILABLE");
  },
  async getPredictionTrace() {
    throw new Error("QUERY_ADAPTER_UNAVAILABLE");
  },
  async getScore() {
    throw new Error("QUERY_ADAPTER_UNAVAILABLE");
  },
  async getQuality() {
    throw new Error("QUERY_ADAPTER_UNAVAILABLE");
  },
  async listAudit() {
    throw new Error("QUERY_ADAPTER_UNAVAILABLE");
  },
});

export function createUnavailableAdminApi() {
  return createAdminApi({
    authenticate: async (_request, requestId) => ({
      problem: problem(
        requestId,
        503,
        "AUTHORIZATION_UNAVAILABLE",
        "Authorization is temporarily unavailable",
      ),
    }),
    queries: unavailableQueries,
  });
}

const databaseRuntime = createDatabaseAdminRuntime();
export const adminApi = databaseRuntime
  ? createAdminApi({
      authenticate: databaseRuntime.authenticator,
      queries: databaseRuntime.queries,
    })
  : createUnavailableAdminApi();
