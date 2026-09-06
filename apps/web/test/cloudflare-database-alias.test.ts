import { describe, expect, it } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import type { Plugin } from "vite";

/*
 * The Cloudflare build swaps the Node database source for the Hyperdrive one
 * during resolution. That swap is the only thing standing between a Worker
 * that talks to Hyperdrive and one that looks for `VELYQ_DATABASE_URL` — a
 * variable Cloudflare does not set — and so reports no database at all.
 *
 * It failed silently once already: a `resolve.alias` never matched, the build
 * still succeeded, and the wrong module shipped. Nothing in a passing build
 * tells you this happened, which is why it is pinned here.
 */

const webDirectory = path
  .resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
  .split(path.sep)
  .join("/");

const NODE_SOURCE = `${webDirectory}/app/runtime-database/runtime-database-source.ts`;
const CLOUDFLARE_SOURCE = `${webDirectory}/app/runtime-database/runtime-database-source.cloudflare.ts`;

type ResolveIdHook = (
  this: {
    resolve: (
      source: string,
      importer?: string,
      options?: Record<string, unknown>,
    ) => Promise<{ id: string } | null>;
  },
  source: string,
  importer: string | undefined,
  options: Record<string, unknown>,
) => Promise<string | null>;

async function loadPlugin() {
  const config = await import("../vite.config");
  const resolved =
    typeof config.default === "function"
      ? await config.default({ command: "build", mode: "production" })
      : config.default;
  const plugins = (resolved.plugins ?? []).flat(
    Number.POSITIVE_INFINITY,
  ) as Plugin[];
  const plugin = plugins.find(
    (candidate) => candidate?.name === "velyq:cloudflare-database-source",
  );
  if (!plugin) throw new Error("database source plugin is not installed");
  return plugin;
}

/** Drives the hook with a resolver that mimics Vite's own path resolution. */
async function resolveWith(plugin: Plugin, source: string, resolvedId: string) {
  const hook = (
    typeof plugin.resolveId === "function"
      ? plugin.resolveId
      : plugin.resolveId?.handler
  ) as ResolveIdHook;
  return hook.call(
    { resolve: async () => (resolvedId ? { id: resolvedId } : null) },
    source,
    `${webDirectory}/app/runtime-database/runtime-database.ts`,
    {},
  );
}

describe("cloudflare database source resolution", () => {
  it("runs before Vinext so per-environment resolve settings cannot bypass it", async () => {
    const plugin = await loadPlugin();
    expect(plugin.enforce).toBe("pre");
  });

  it("redirects the extensionless specifier production code actually imports", async () => {
    const plugin = await loadPlugin();
    const result = await resolveWith(
      plugin,
      "./runtime-database-source",
      NODE_SOURCE,
    );
    expect(result).toBe(CLOUDFLARE_SOURCE);
  });

  it("redirects an already-extended specifier", async () => {
    const plugin = await loadPlugin();
    const result = await resolveWith(
      plugin,
      "./runtime-database-source.ts",
      NODE_SOURCE,
    );
    expect(result).toBe(CLOUDFLARE_SOURCE);
  });

  it("matches on the resolved id, not on Windows-separated text", async () => {
    const plugin = await loadPlugin();
    // What Vite hands back on Windows before normalisation.
    const windowsId = NODE_SOURCE.split("/").join("\\");
    const result = await resolveWith(
      plugin,
      "./runtime-database-source",
      windowsId,
    );
    expect(result).toBe(CLOUDFLARE_SOURCE);
  });

  it("leaves the Cloudflare source itself alone, so it cannot self-redirect", async () => {
    const plugin = await loadPlugin();
    const result = await resolveWith(
      plugin,
      "./runtime-database-source.cloudflare",
      CLOUDFLARE_SOURCE,
    );
    expect(result).toBeNull();
  });

  it("leaves unrelated modules alone", async () => {
    const plugin = await loadPlugin();
    expect(
      await resolveWith(plugin, "./runtime-database", `${webDirectory}/x.ts`),
    ).toBeNull();
    expect(
      await resolveWith(plugin, "drizzle-orm", `${webDirectory}/y.ts`),
    ).toBeNull();
  });

  it("keeps the Node source free of Cloudflare-only imports", () => {
    const nodeSource = readFileSync(NODE_SOURCE, "utf8");
    expect(nodeSource).not.toContain("cloudflare:workers");
  });
});
