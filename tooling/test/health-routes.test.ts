import { afterEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => {
  const query = vi.fn();
  const close = vi.fn();
  const create = vi.fn(() => ({ pool: { query }, close }));
  return { close, create, query };
});

vi.mock("@velyq/database", () => ({
  createPrivilegedDatabaseClient: database.create,
}));
vi.mock("@velyq/database/client", () => ({
  createPrivilegedDatabaseClient: database.create,
}));
vi.mock("../../packages/database/dist/index.js", () => ({
  createPrivilegedDatabaseClient: database.create,
}));
vi.mock("../../packages/database/dist/client.js", () => ({
  createPrivilegedDatabaseClient: database.create,
}));

import { GET as customerReady } from "../../apps/web/app/api/ready/route.js";
import { GET as customerHealth } from "../../apps/web/app/api/health/route.js";
import { GET as adminReady } from "../../apps/admin/app/api/ready/route.js";
import { GET as adminHealth } from "../../apps/admin/app/api/health/route.js";

const names = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "VELYQ_DATABASE_URL",
] as const;
const saved = new Map<string, string | undefined>();

afterEach(() => {
  for (const name of names) {
    const value = saved.get(name);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  saved.clear();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function setRuntimeConfig(configured: boolean) {
  for (const name of names) {
    saved.set(name, process.env[name]);
    if (!configured) delete process.env[name];
  }
  if (!configured) return;
  process.env["NEXT_PUBLIC_SUPABASE_URL"] = "https://auth.example.test";
  process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] = "publishable-test-key";
  process.env["VELYQ_DATABASE_URL"] =
    "postgresql://velyq:secret@db.example.test/velyq";
}

describe("service health contracts", () => {
  it("returns non-sensitive liveness for customer and admin", async () => {
    expect((await customerHealth()).status).toBe(200);
    expect((await adminHealth()).status).toBe(200);
    expect(await (await customerHealth()).json()).toMatchObject({
      status: "ok",
      syntheticOnly: true,
    });
  });

  it("fails readiness closed when runtime configuration is absent", async () => {
    setRuntimeConfig(false);
    expect((await customerReady()).status).toBe(503);
    expect((await adminReady()).status).toBe(503);
    expect(database.create).not.toHaveBeenCalled();
  });

  it.each([
    ["customer", customerReady, "velyq-customer"],
    ["admin", adminReady, "velyq-admin"],
  ] as const)(
    "returns ready for the %s service",
    async (_name, ready, service) => {
      setRuntimeConfig(true);
      database.query.mockResolvedValueOnce({ rows: [{ ready: 1 }] });
      const authFetch = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal("fetch", authFetch);

      const response = await ready();

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        status: "ready",
        service,
        authConfigured: true,
      });
      expect(database.create).toHaveBeenCalledWith({
        connectionString: process.env["VELYQ_DATABASE_URL"],
        connectionTimeoutMillis: 3000,
      });
      expect(database.query).toHaveBeenCalledWith("select 1");
      expect(authFetch).toHaveBeenCalledWith(
        "https://auth.example.test/auth/v1/settings",
        {
          headers: { apikey: "publishable-test-key" },
          cache: "no-store",
        },
      );
      expect(database.close).toHaveBeenCalledOnce();
    },
  );

  it.each([
    ["database failure", new Error("database unavailable")],
    ["database timeout", new Error("connection timeout")],
  ])("returns degraded on %s and closes the client", async (_name, error) => {
    setRuntimeConfig(true);
    database.query.mockRejectedValueOnce(error);
    vi.stubGlobal("fetch", vi.fn());

    const response = await customerReady();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      status: "degraded",
      service: "velyq-customer",
      authConfigured: true,
    });
    expect(database.close).toHaveBeenCalledOnce();
  });

  it("returns degraded when the auth dependency is not ready", async () => {
    setRuntimeConfig(true);
    database.query.mockResolvedValueOnce({ rows: [{ ready: 1 }] });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    const response = await adminReady();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      status: "degraded",
      service: "velyq-admin",
      authConfigured: true,
    });
    expect(database.close).toHaveBeenCalledOnce();
  });
});
