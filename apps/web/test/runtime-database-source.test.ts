import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveConfig } from "vite";
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

  it(
    "resolves the exact Node source module to the Cloudflare module in Vinext",
    async () => {
      const testDirectory = path.dirname(fileURLToPath(import.meta.url));
      const webDirectory = path.resolve(testDirectory, "..");
      const nodeSource = path.join(
        webDirectory,
        "app/runtime-database/runtime-database-source.ts",
      );
      const cloudflareSource = path.join(
        webDirectory,
        "app/runtime-database/runtime-database-source.cloudflare.ts",
      );
      const config = await resolveConfig(
        {
          root: webDirectory,
          configFile: path.join(webDirectory, "vite.config.ts"),
        },
        "build",
      );
      const resolver = config.createResolver();
      const resolved = await resolver(nodeSource);
      const resolvedExtensionless = await resolver(
        nodeSource.slice(0, -path.extname(nodeSource).length),
      );

      expect(path.normalize(resolved ?? "")).toBe(
        path.normalize(cloudflareSource),
      );
      expect(path.normalize(resolvedExtensionless ?? "")).toBe(
        path.normalize(cloudflareSource),
      );
    },
    30_000,
  );
});
