import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SECRET = "test-route-secret";

/*
 * Exercises the real route handlers directly (Next route handlers are
 * plain functions over the Web Request/Response APIs, so no server needs
 * to run) -- covering the auth and validation layers that run before any
 * database access, plus the real "no database configured" fallback this
 * test environment naturally exercises (VELYQ_DATABASE_URL is unset here).
 */
describe("POST/GET /api/internal/forecast-cycle", () => {
  beforeEach(() => {
    process.env["CRON_SECRET"] = SECRET;
    delete process.env["VELYQ_DATABASE_URL"];
  });
  afterEach(() => {
    delete process.env["CRON_SECRET"];
  });

  it("rejects a request with no Authorization header", async () => {
    const { POST } = await import("../app/api/internal/forecast-cycle/route");
    const response = await POST(
      new Request("http://localhost/api/internal/forecast-cycle", {
        method: "POST",
        body: "{}",
      }),
    );
    expect(response.status).toBe(401);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body["error"]).toBe("Unauthorized");
    // Never leaks the configured secret, or even whether one is configured.
    expect(JSON.stringify(body)).not.toContain(SECRET);
  });

  it("rejects a request with the wrong secret", async () => {
    const { POST } = await import("../app/api/internal/forecast-cycle/route");
    const response = await POST(
      new Request("http://localhost/api/internal/forecast-cycle", {
        method: "POST",
        headers: { authorization: "Bearer wrong-secret" },
        body: "{}",
      }),
    );
    expect(response.status).toBe(401);
  });

  it("returns 503 (not a caller-facing auth error) when no secret is configured at all", async () => {
    delete process.env["CRON_SECRET"];
    const { POST } = await import("../app/api/internal/forecast-cycle/route");
    const response = await POST(
      new Request("http://localhost/api/internal/forecast-cycle", {
        method: "POST",
        headers: { authorization: `Bearer ${SECRET}` },
        body: "{}",
      }),
    );
    expect(response.status).toBe(503);
  });

  it("rejects an invalid request body after authenticating", async () => {
    const { POST } = await import("../app/api/internal/forecast-cycle/route");
    const response = await POST(
      new Request("http://localhost/api/internal/forecast-cycle", {
        method: "POST",
        headers: { authorization: `Bearer ${SECRET}` },
        body: JSON.stringify({ from: "not-a-date" }),
      }),
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body["reason"]).toBe("INVALID_FROM");
  });

  it("rejects an oversized window after authenticating", async () => {
    const { POST } = await import("../app/api/internal/forecast-cycle/route");
    const response = await POST(
      new Request("http://localhost/api/internal/forecast-cycle", {
        method: "POST",
        headers: { authorization: `Bearer ${SECRET}` },
        body: JSON.stringify({
          from: "2026-09-25T00:00:00.000Z",
          to: "2026-11-25T00:00:00.000Z",
        }),
      }),
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body["reason"]).toBe("WINDOW_TOO_LARGE");
  });

  it("with valid auth and a valid request, reports 503 when no database is configured, rather than crashing", async () => {
    const { POST } = await import("../app/api/internal/forecast-cycle/route");
    const response = await POST(
      new Request("http://localhost/api/internal/forecast-cycle", {
        method: "POST",
        headers: { authorization: `Bearer ${SECRET}` },
        body: "{}",
      }),
    );
    expect(response.status).toBe(503);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body["error"]).toBe("Database unavailable");
  });

  it("GET (the path Vercel Cron actually invokes) runs the same auth/validation path with the default window", async () => {
    const { GET } = await import("../app/api/internal/forecast-cycle/route");
    const unauthorized = await GET(
      new Request("http://localhost/api/internal/forecast-cycle"),
    );
    expect(unauthorized.status).toBe(401);

    const authorized = await GET(
      new Request("http://localhost/api/internal/forecast-cycle", {
        headers: { authorization: `Bearer ${SECRET}` },
      }),
    );
    // No database configured in this test environment -- still a clean
    // operational 503, not an unhandled exception.
    expect(authorized.status).toBe(503);
  });
});
