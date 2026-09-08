import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  close: vi.fn<() => Promise<void>>(),
}));

vi.mock("../app/api/auth", () => ({
  customerFixtureMode: () => false,
  requireCustomerSession: async () => null,
}));

vi.mock("../app/runtime-database/runtime-database", () => ({
  openRuntimeDatabaseSession: async () => ({
    database: {},
    close: state.close,
  }),
}));

vi.mock("@velyq/database", () => ({
  DatabaseHistoryQueryAdapter: class {
    async listDecisions() {
      return [];
    }
  },
}));

const originalEnvironment = { ...process.env };

beforeEach(() => {
  process.env = {
    ...originalEnvironment,
    NODE_ENV: "production",
    VELYQ_CUSTOMER_INTELLIGENCE_MODE: "LIVE",
  };
  delete process.env["VELYQ_DATA_MODE"];
  delete process.env["VELYQ_SYNTHETIC_PREVIEW"];
  state.close.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  process.env = { ...originalEnvironment };
  vi.resetModules();
});

describe("live decision history", () => {
  it("never serves demo decisions in the production customer mode", async () => {
    const { GET } = await import("../app/api/v1/history/route");

    const response = await GET(
      new Request("https://velyq.test/api/v1/history"),
    );
    const body = (await response.json()) as {
      syntheticLabel: string;
      decisions: unknown[];
    };

    expect(response.status).toBe(200);
    expect(body.syntheticLabel).toBe("Live data");
    expect(body.decisions).toEqual([]);
    expect(state.close).toHaveBeenCalledOnce();
  });
});
