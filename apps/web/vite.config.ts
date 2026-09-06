import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";

/*
 * This config builds the Cloudflare Worker only; the Vercel/Node build goes
 * through next.config and never sees it. So every module graph produced here
 * must resolve each platform-neutral source's Cloudflare variant rather than
 * its Node one — currently the database source and the rate-limit store.
 */
const toModuleId = (value: string) => value.split(path.sep).join("/");
const webDirectory = toModuleId(path.dirname(fileURLToPath(import.meta.url)));

const PLATFORM_SOURCES = [
  "app/runtime-database/runtime-database-source",
  "app/rate-limit/rate-limit-source",
] as const;

/*
 * A `resolve.alias` was the obvious way to do this and it silently did not
 * work. Two reasons, both invisible at build time: alias `find` strings are
 * compared against posix module ids, so paths built with `path.join` on
 * Windows never matched; and Vinext declares per-environment `resolve`
 * settings, which replace the root-level alias array rather than merging with
 * it. The build succeeded either way and shipped a Worker whose database
 * source read `process.env.VELYQ_DATABASE_URL` — a variable Cloudflare does
 * not set — so it behaved as though no database were configured at all.
 *
 * Resolving through a `pre` plugin hook avoids both traps: it runs before
 * Vinext in every environment, and it compares fully-resolved ids instead of
 * matching raw specifier text.
 */
function cloudflarePlatformSourcePlugin(): Plugin {
  const nodeSources = PLATFORM_SOURCES.map(
    (relative) => `${webDirectory}/${relative}.ts`,
  );
  // The filename alone: a bare specifier like "./rate-limit-source" never
  // contains its own directory prefix, so matching has to be on the base
  // name, not the full relative path.
  const baseNames = PLATFORM_SOURCES.map((relative) =>
    relative.split("/").pop()!,
  );
  return {
    name: "velyq:cloudflare-platform-source",
    enforce: "pre",
    async resolveId(source, importer, options) {
      if (!baseNames.some((name) => source.includes(name))) return null;
      if (source.includes(".cloudflare")) return null;
      const resolved = await this.resolve(source, importer, {
        ...options,
        skipSelf: true,
      });
      if (!resolved) return null;
      const resolvedId = toModuleId(resolved.id);
      const index = nodeSources.indexOf(resolvedId);
      if (index === -1) return null;
      return `${webDirectory}/${PLATFORM_SOURCES[index]}.cloudflare.ts`;
    },
  };
}

export default defineConfig({
  plugins: [
    cloudflarePlatformSourcePlugin(),
    vinext(),
    cloudflare({
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    }),
  ],
});
