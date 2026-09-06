import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveRuntimeDatabaseSource as resolveNodeSource } from "../app/runtime-database/runtime-database-source";

const cloudflareState = vi.hoisted(() => ({
  env: {} as Partial<Pick<Env, "HYPERDRIVE">>,
}));

vi.mock("cloudflare:workers", () => ({
  get env() {
    return cloudflareState.env;
  },
}));

import { resolveRuntimeDatabaseSource as resolveCloudflareSource } from "../app/runtime-database/runtime-database-source.cloudflare";

const originalDatabaseUrl = process.env["VELYQ_DATABASE_URL"];

afterEach(() => {
  if (originalDatabaseUrl === undefined)
    delete process.env["VELYQ_DATABASE_URL"];
  else process.env["VELYQ_DATABASE_URL"] = originalDatabaseUrl;
  cloudflareState.env = {};
});

describe("runtime database source", () => {
  it("uses VELYQ_DATABASE_URL in the default Node runtime", async () => {
    process.env["VELYQ_DATABASE_URL"] = "postgres://node-runtime/database";

    await expect(resolveNodeSource()).resolves.toEqual({
      kind: "node",
      connectionString: "postgres://node-runtime/database",
    });
  });

  it("returns null when the Node runtime has no database URL", async () => {
    delete process.env["VELYQ_DATABASE_URL"];

    await expect(resolveNodeSource()).resolves.toBeNull();
  });

  it("uses the generated Hyperdrive binding in the Cloudflare runtime", async () => {
    cloudflareState.env = {
      HYPERDRIVE: {
        connectionString: "postgres://hyperdrive/database",
      } as Hyperdrive,
    };

    await expect(resolveCloudflareSource()).resolves.toEqual({
      kind: "hyperdrive",
      connectionString: "postgres://hyperdrive/database",
    });
  });

  it("returns null when the Cloudflare runtime has no Hyperdrive binding", async () => {
    cloudflareState.env = {};

    await expect(resolveCloudflareSource()).resolves.toBeNull();
  });

  /*
   * A test that resolved this through `config.createResolver()` used to live
   * here. It passed while the real build shipped the wrong module, because a
   * standalone resolver applies `resolve.alias` but does not run plugin
   * `resolveId` hooks — so it proved something the build never did.
   *
   * The swap is now covered where it actually happens: the hook itself in
   * cloudflare-database-alias.test.ts, and the emitted Worker bundle in
   * tooling/scripts/verify-worker-bundle.mjs.
   */
});
