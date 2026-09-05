import { describe, expect, it } from "vitest";
import type { Principal } from "@velyq/auth";
import { createAdminApi, type AdminQueries } from "../app/admin-api.js";

const principal = {
  userId: "00000000-0000-4000-8000-000000000003",
  role: "ADMIN" as const,
  permissions: ["admin.access", "provider_runs.read"] as const,
};

const queries: AdminQueries = {
  listProviderRuns: async () => ({ items: [], nextCursor: null }),
  getProviderRun: async () => ({
    id: "00000000-0000-4000-8000-000000000004",
    providerCode: "synthetic-provider",
    sequenceName: "sequence-01-opening",
    status: "COMPLETED",
    sourceFixtureHash: "sha256:source",
    normalizedOutputHash: "sha256:normalized",
    receivedCount: 9,
    acceptedCount: 9,
    rejectedCount: 0,
    startedAt: "2026-09-03T10:00:00Z",
    completedAt: "2026-09-03T10:01:00Z",
    errorSummary: null,
  }),
  getPredictionTrace: async () => {
    throw new Error("NOT_FOUND");
  },
  getScore: async () => {
    throw new Error("NOT_FOUND");
  },
  getQuality: async () => {
    throw new Error("NOT_FOUND");
  },
  listAudit: async () => ({ items: [], nextCursor: null }),
};

function api(overrides: Partial<Principal> = {}) {
  return createAdminApi({
    authenticate: async () => ({ principal: { ...principal, ...overrides } }),
    queries,
  });
}

describe("admin BFF authorization and problem details", () => {
  it("denies a normal or partially permitted principal before querying", async () => {
    const response = await api({
      role: "CUSTOMER",
      permissions: [],
    }).listProviderRuns(
      new Request("https://admin.velyq.dev/api/v1/admin/provider-runs"),
    );
    expect(response.status).toBe(403);
    expect(response.headers.get("content-type")).toContain("problem+json");
  });

  it("validates resource identifiers at the BFF boundary", async () => {
    const response = await api().getProviderRun(
      new Request("https://admin.velyq.dev/api/v1/admin/provider-runs/nope"),
      { runId: "nope" },
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: "INVALID_REQUEST",
      status: 400,
    });
  });

  it("returns typed provider-run data for the matching permission", async () => {
    const response = await api().getProviderRun(
      new Request(
        "https://admin.velyq.dev/api/v1/admin/provider-runs/00000000-0000-4000-8000-000000000004",
      ),
      { runId: "00000000-0000-4000-8000-000000000004" },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      providerCode: "synthetic-provider",
      sourceFixtureHash: "sha256:source",
    });
  });
});
