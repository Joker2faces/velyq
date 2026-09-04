import { afterEach, describe, expect, it } from "vitest";
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
});

function clearRuntimeConfig() {
  for (const name of names) {
    saved.set(name, process.env[name]);
    delete process.env[name];
  }
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
    clearRuntimeConfig();
    expect((await customerReady()).status).toBe(503);
    expect((await adminReady()).status).toBe(503);
  });
});
