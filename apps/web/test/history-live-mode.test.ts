import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decodeHistoryCursor } from "../app/customer/history-cursor";

const state = vi.hoisted(() => ({
  close: vi.fn<() => Promise<void>>(),
  pages: [] as unknown[][],
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
    async listDecisions(
      _limit: number,
      before: { createdAt: Date; id: string } | undefined,
      synthetic: boolean | undefined,
    ) {
      if (synthetic !== false) return state.pages[2] ?? [];
      return before ? (state.pages[1] ?? []) : (state.pages[0] ?? []);
    }
  },
}));

function historyRow(id: string, createdAt: string, synthetic = false) {
  return {
    decision: {
      id,
      createdAt: new Date(createdAt),
      selection: "HOME",
      status: "STRONG_EDGE",
      offeredOdds: "2.00000000",
      fairOdds: "1.80000000",
      expectedValue: "0.100000000000",
    },
    forecast: { modelVersion: "test.v1", probability: "0.550000000000" },
    event: { synthetic },
    competition: { nameKey: "competition.test" },
    marketDefinition: { labelKey: "market.match_winner" },
    settlement: null,
    result: null,
    homeTeam: synthetic ? "Synthetic Home" : "Live Home",
    awayTeam: synthetic ? "Synthetic Away" : "Live Away",
  };
}

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
  state.pages = [[], [], []];
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

  it("uses an exact live-corpus cursor and reports the final page honestly", async () => {
    const first = historyRow("decision-1", "2026-09-10T12:00:00.000Z");
    const second = historyRow("decision-2", "2026-09-10T11:00:00.000Z");
    const sentinel = historyRow("decision-3", "2026-09-10T10:00:00.000Z");
    state.pages = [
      [first, second, sentinel],
      [sentinel],
      [historyRow("synthetic-poison", "2026-09-10T13:00:00.000Z", true)],
    ];
    const { GET } = await import("../app/api/v1/history/route");

    const firstResponse = await GET(
      new Request("https://velyq.test/api/v1/history?limit=2"),
    );
    const firstBody = (await firstResponse.json()) as {
      syntheticLabel: string;
      hasMore: boolean;
      nextCursor: string | null;
      decisions: { id: string }[];
    };
    expect(firstBody).toMatchObject({
      syntheticLabel: "Live data",
      hasMore: true,
      decisions: [{ id: "decision-1" }, { id: "decision-2" }],
    });
    expect(firstBody.nextCursor).toEqual(expect.any(String));
    expect(decodeHistoryCursor(firstBody.nextCursor)).toEqual({
      createdAt: new Date("2026-09-10T11:00:00.000Z"),
      id: "decision-2",
    });

    const finalResponse = await GET(
      new Request(
        `https://velyq.test/api/v1/history?limit=2&cursor=${firstBody.nextCursor}`,
      ),
    );
    const finalBody = (await finalResponse.json()) as {
      syntheticLabel: string;
      hasMore: boolean;
      nextCursor: string | null;
      decisions: { id: string }[];
    };
    expect(finalBody).toEqual(
      expect.objectContaining({
        syntheticLabel: "Live data",
        hasMore: false,
        nextCursor: null,
        decisions: [expect.objectContaining({ id: "decision-3" })],
      }),
    );
  });
});
