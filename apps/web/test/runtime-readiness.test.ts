import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Readiness previously proved the database by reading `VELYQ_DATABASE_URL` and
 * opening its own privileged client. On Cloudflare that variable is absent by
 * design — the connection string comes from the Hyperdrive binding — so the
 * route reported `degraded` on a Worker that was in fact perfectly healthy.
 * These tests pin readiness to the runtime session instead, so it proves
 * whichever database path the runtime actually selected.
 */

const runtimeState = vi.hoisted(() => ({
  source: "node" as "node" | "hyperdrive" | null,
  queryError: null as Error | null,
  closeError: null as Error | null,
  queries: [] as string[],
  closes: 0,
}));

vi.mock("../app/runtime-database/runtime-database", () => ({
  openRuntimeDatabaseSession: async () => {
    if (!runtimeState.source) return null;
    return {
      source: runtimeState.source,
      client: {
        pool: {
          query: async (text: string) => {
            runtimeState.queries.push(text);
            if (runtimeState.queryError) throw runtimeState.queryError;
            return { rows: [{ "?column?": 1 }] };
          },
        },
      },
      close: async () => {
        runtimeState.closes += 1;
        if (runtimeState.closeError) throw runtimeState.closeError;
      },
    };
  },
}));

const AUTH_URL = "https://project.supabase.co";
const AUTH_KEY = "sb_publishable_test";

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  runtimeState.source = "node";
  runtimeState.queryError = null;
  runtimeState.closeError = null;
  runtimeState.queries = [];
  runtimeState.closes = 0;
  process.env["NEXT_PUBLIC_SUPABASE_URL"] = AUTH_URL;
  process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] = AUTH_KEY;
  // Readiness must never depend on this on Cloudflare.
  delete process.env["VELYQ_DATABASE_URL"];
  fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function get() {
  const { GET } = await import("../app/api/ready/route");
  return GET();
}

describe("customer readiness", () => {
  it("is ready on the Node path without touching the Supabase auth settings twice", async () => {
    const response = await get();
    const body = (await response.json()) as Record<string, unknown>;
    expect(response.status).toBe(200);
    expect(body["status"]).toBe("ready");
    expect(runtimeState.queries).toEqual(["select 1"]);
  });

  it("is ready on Hyperdrive with no VELYQ_DATABASE_URL present", async () => {
    runtimeState.source = "hyperdrive";
    const response = await get();
    const body = (await response.json()) as Record<string, unknown>;
    expect(response.status).toBe(200);
    expect(body["status"]).toBe("ready");
    // The proof that Hyperdrive was exercised, not merely configured.
    expect(runtimeState.queries).toEqual(["select 1"]);
    expect((body["checks"] as Record<string, unknown>)["databaseSource"]).toBe(
      "hyperdrive",
    );
  });

  it("is degraded when no database source resolves", async () => {
    runtimeState.source = null;
    const response = await get();
    expect(response.status).toBe(503);
    expect(runtimeState.queries).toEqual([]);
  });

  it("is degraded when the database query fails", async () => {
    runtimeState.queryError = new Error("connection refused");
    const response = await get();
    expect(response.status).toBe(503);
  });

  it("is degraded when Supabase auth is unreachable", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 500 }));
    const response = await get();
    expect(response.status).toBe(503);
  });

  it("is degraded when Supabase auth is not configured", async () => {
    delete process.env["NEXT_PUBLIC_SUPABASE_URL"];
    const response = await get();
    expect(response.status).toBe(503);
    expect(runtimeState.queries).toEqual([]);
  });

  it("closes the session on success and on failure", async () => {
    await get();
    expect(runtimeState.closes).toBe(1);

    vi.resetModules();
    runtimeState.queryError = new Error("boom");
    await get();
    expect(runtimeState.closes).toBe(2);
  });

  it("still reports ready when releasing the connection fails", async () => {
    runtimeState.closeError = new Error("close failed");
    /*
     * The probe already proved the database and auth are reachable, so the
     * service is ready. A failure to hand the connection back is a cleanup
     * problem: it must neither surface as a 500 nor mislabel a healthy service
     * as degraded.
     */
    const response = await get();
    expect(response.status).toBe(200);
    expect(runtimeState.closes).toBe(1);
  });
});
