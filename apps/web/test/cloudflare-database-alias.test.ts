import { beforeAll, describe, expect, it } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import type { Plugin } from "vite";

/*
 * The Cloudflare build swaps each platform-neutral source (database,
 * rate-limit store) for its Cloudflare variant during resolution. That swap
 * is the only thing standing between a Worker that talks to Hyperdrive/KV and
 * one that looks for a Node-only env var or binding that Cloudflare never
 * sets, and so behaves as though the dependency were entirely absent.
 *
 * It failed silently once already, for the database source: a `resolve.alias`
 * never matched, the build still succeeded, and the wrong module shipped.
 * Nothing in a passing build tells you this happened, which is why it is
 * pinned here directly against the plugin, and against the emitted bundle in
 * tooling/scripts/verify-worker-bundle.mjs.
 */

const webDirectory = path
  .resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
  .split(path.sep)
  .join("/");

const SOURCE_PAIRS = [
  {
    label: "database",
    node: `${webDirectory}/app/runtime-database/runtime-database-source.ts`,
    cloudflare: `${webDirectory}/app/runtime-database/runtime-database-source.cloudflare.ts`,
    specifier: "./runtime-database-source",
  },
  {
    label: "rate-limit store",
    node: `${webDirectory}/app/rate-limit/rate-limit-source.ts`,
    cloudflare: `${webDirectory}/app/rate-limit/rate-limit-source.cloudflare.ts`,
    specifier: "./rate-limit-source",
  },
] as const;

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

/** Vite's plugin type is deeply recursive, so flatten it as plain unknowns. */
function flatten(value: unknown): Plugin[] {
  if (Array.isArray(value)) return value.flatMap(flatten);
  return value ? [value as Plugin] : [];
}

/*
 * Importing the config pulls in Vinext and the Cloudflare plugin, which is
 * slow enough under a full-suite run to blow the default per-test timeout.
 * Load it once, up front, and let every test share the result.
 */
let cached: Plugin | undefined;

beforeAll(async () => {
  cached = await loadPlugin();
}, 60_000);

async function loadPlugin() {
  if (cached) return cached;
  const config = await import("../vite.config");
  const plugins = flatten(config.default.plugins);
  const plugin = plugins.find(
    (candidate) => candidate?.name === "velyq:cloudflare-platform-source",
  );
  if (!plugin) throw new Error("platform-source plugin is not installed");
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

describe("cloudflare platform source resolution", () => {
  it("runs before Vinext so per-environment resolve settings cannot bypass it", async () => {
    const plugin = await loadPlugin();
    expect(plugin.enforce).toBe("pre");
  });

  for (const pair of SOURCE_PAIRS) {
    describe(pair.label, () => {
      it("redirects the extensionless specifier production code actually imports", async () => {
        const plugin = await loadPlugin();
        const result = await resolveWith(plugin, pair.specifier, pair.node);
        expect(result).toBe(pair.cloudflare);
      });

      it("redirects an already-extended specifier", async () => {
        const plugin = await loadPlugin();
        const result = await resolveWith(
          plugin,
          `${pair.specifier}.ts`,
          pair.node,
        );
        expect(result).toBe(pair.cloudflare);
      });

      it("matches on the resolved id, not on Windows-separated text", async () => {
        const plugin = await loadPlugin();
        const windowsId = pair.node.split("/").join("\\");
        const result = await resolveWith(plugin, pair.specifier, windowsId);
        expect(result).toBe(pair.cloudflare);
      });

      it("leaves the Cloudflare source itself alone, so it cannot self-redirect", async () => {
        const plugin = await loadPlugin();
        const result = await resolveWith(
          plugin,
          `${pair.specifier}.cloudflare`,
          pair.cloudflare,
        );
        expect(result).toBeNull();
      });

      it("keeps the Node source free of Cloudflare-only imports", () => {
        const nodeSource = readFileSync(pair.node, "utf8");
        expect(nodeSource).not.toContain("cloudflare:workers");
      });
    });
  }

  it("leaves unrelated modules alone", async () => {
    const plugin = await loadPlugin();
    expect(
      await resolveWith(plugin, "./runtime-database", `${webDirectory}/x.ts`),
    ).toBeNull();
    expect(
      await resolveWith(plugin, "drizzle-orm", `${webDirectory}/y.ts`),
    ).toBeNull();
  });
});
