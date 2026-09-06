import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";

/*
 * This config builds the Cloudflare Worker only; the Vercel/Node build goes
 * through next.config and never sees it. So every module graph produced here
 * must resolve the Hyperdrive database source rather than the Node one.
 */
const toModuleId = (value: string) => value.split(path.sep).join("/");

const webDirectory = toModuleId(path.dirname(fileURLToPath(import.meta.url)));
const nodeDatabaseSource = `${webDirectory}/app/runtime-database/runtime-database-source.ts`;
const cloudflareDatabaseSource = `${webDirectory}/app/runtime-database/runtime-database-source.cloudflare.ts`;

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
function cloudflareDatabaseSourcePlugin(): Plugin {
  return {
    name: "velyq:cloudflare-database-source",
    enforce: "pre",
    async resolveId(source, importer, options) {
      if (!source.includes("runtime-database-source")) return null;
      if (source.includes(".cloudflare")) return null;
      const resolved = await this.resolve(source, importer, {
        ...options,
        skipSelf: true,
      });
      if (!resolved) return null;
      if (toModuleId(resolved.id) !== nodeDatabaseSource) return null;
      return cloudflareDatabaseSource;
    },
  };
}

export default defineConfig({
  plugins: [
    cloudflareDatabaseSourcePlugin(),
    vinext(),
    cloudflare({
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    }),
  ],
});
