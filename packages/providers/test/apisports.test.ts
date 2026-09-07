import { describe, expect, it, vi } from "vitest";
import type { DecimalString } from "@velyq/decimal";
import {
  createApiSportsClient,
  deduplicateObservations,
  normalizeBasketballGame,
  normalizeFootballFixture,
  normalizeOdds,
  sanitizeProviderError,
} from "../src/apisports.ts";

const footballFixture = {
  fixture: {
    id: 101,
    date: "2026-09-07T18:00:00+00:00",
    status: { short: "NS" },
  },
  league: { name: "Test League" },
  teams: { home: { name: "Home" }, away: { name: "Away" } },
};
const basketballGame = {
  id: 202,
  date: "2026-09-07T18:00:00Z",
  status: { short: "NS" },
  teams: { home: { name: "Home Hoops" }, away: { name: "Away Hoops" } },
  league: { name: "Test Basketball" },
};

describe("API-Sports provider boundary", () => {
  it("normalizes football and basketball event shapes without sharing assumptions", () => {
    expect(normalizeFootballFixture(footballFixture).sport).toBe("FOOTBALL");
    expect(normalizeBasketballGame(basketballGame).sport).toBe("BASKETBALL");
  });
  it("maps known markets and quarantines unknown markets", () => {
    const rows = normalizeOdds(
      {
        fixture: 101,
        update: "2026-09-07T18:00:00Z",
        bookmakers: [
          {
            name: "Book",
            bets: [
              { id: 1, values: [{ value: "Home", odd: "1.85" }] },
              { id: 999, values: [{ value: "Mystery", odd: "2.1" }] },
            ],
          },
        ],
      },
      "FOOTBALL",
      "2026-09-07T18:01:00Z",
    );
    expect(rows.map((row) => row.canonicalMarket)).toEqual([
      "MATCH_WINNER_1X2",
      "UNMAPPED",
    ]);
  });
  it("deduplicates identical observations while preserving chronological order", () => {
    const row = {
      sport: "FOOTBALL" as const,
      eventId: "1",
      competitionId: "c",
      bookmakerId: "b",
      market: "MATCH_WINNER_1X2" as const,
      providerMarket: "1",
      selection: "Home",
      decimalOdds: "1.85" as DecimalString,
      providerObservedAt: "2026-09-07T18:00:00Z",
      ingestedAt: "2026-09-07T18:01:00Z",
      provider: "API_SPORTS" as const,
      sourceReference: "r",
    };
    expect(deduplicateObservations([row, row])).toHaveLength(1);
  });
  it("uses the key only server-side, handles provider failures, and captures quota", async () => {
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        expect(new Headers(init?.headers).get("x-apisports-key")).toBe(
          "secret",
        );
        return new Response(JSON.stringify({ results: 0, response: [] }), {
          status: 200,
          headers: { "x-ratelimit-remaining": "42" },
        });
      },
    );
    const response = await createApiSportsClient("football", {
      apiKey: "secret",
      fetch: fetcher,
    }).get("/fixtures", { date: "2026-09-07" });
    expect(response.body.results).toBe(0);
    expect(response.quota.state).toBe("HEALTHY");
    expect(
      sanitizeProviderError(new Error("x-apisports-key=secret")).toLowerCase(),
    ).not.toContain("secret");
  });
  it("retries rate limits and server failures, then exposes the final response", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ errors: [] }), { status: 429 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ response: [] }), { status: 200 }),
      );
    const result = await createApiSportsClient("football", {
      fetch: fetcher,
      apiKey: "x",
      retries: 1,
    }).get("/fixtures");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result.status).toBe(200);
  });
  it("fails closed on invalid provider payloads and timeouts", async () => {
    await expect(
      createApiSportsClient("football", {
        apiKey: "x",
        fetch: vi.fn(async () => new Response("not-json", { status: 200 })),
      }).get("/fixtures"),
    ).rejects.toThrow("PROVIDER_INVALID_JSON");
    await expect(
      createApiSportsClient("football", {
        apiKey: "x",
        timeoutMs: 1,
        retries: 0,
        fetch: vi.fn(
          (_input, init) =>
            new Promise((_resolve, reject) => {
              init?.signal?.addEventListener("abort", () =>
                reject(new Error("aborted")),
              );
            }),
        ),
      }).get("/fixtures"),
    ).rejects.toThrow("aborted");
  });
});
