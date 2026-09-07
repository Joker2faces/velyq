import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../tooling/scripts/apisports-ingest", () => ({
  runApiSportsIngestion: vi.fn(async ({ sport, date }) => ({
    provider: "API_SPORTS",
    sport: sport.toUpperCase(),
    date,
    events: 2,
    normalizedOdds: 3,
    persisted: true,
    status: "COMPLETE",
  })),
}));

import { POST } from "../app/api/internal/provider-ingest/route";

afterEach(() => {
  delete process.env["VELYQ_INGEST_SECRET"];
});

describe("internal provider ingestion", () => {
  it("rejects requests without the server secret", async () => {
    process.env["VELYQ_INGEST_SECRET"] = "expected-secret";
    const response = await POST(
      new Request("https://velyq.test/api/internal/provider-ingest", {
        method: "POST",
        body: JSON.stringify({ sport: "football", date: "2026-09-07" }),
      }),
    );
    expect(response.status).toBe(401);
  });

  it("validates bounded inputs and invokes the shared service", async () => {
    process.env["VELYQ_INGEST_SECRET"] = "expected-secret";
    const response = await POST(
      new Request("https://velyq.test/api/internal/provider-ingest", {
        method: "POST",
        headers: { authorization: "Bearer expected-secret" },
        body: JSON.stringify({ sport: "football", date: "2026-09-07" }),
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      persisted: true,
      status: "COMPLETE",
    });
  });
});
