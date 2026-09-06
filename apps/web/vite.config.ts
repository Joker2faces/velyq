import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";

const webDirectory = path.dirname(fileURLToPath(import.meta.url));
const nodeDatabaseSource = path.join(
  webDirectory,
  "app/runtime-database/runtime-database-source.ts",
);
const cloudflareDatabaseSource = path.join(
  webDirectory,
  "app/runtime-database/runtime-database-source.cloudflare.ts",
);

export default defineConfig({
  resolve: {
    alias: [
      {
        find: nodeDatabaseSource,
        replacement: cloudflareDatabaseSource,
      },
    ],
  },
  plugins: [
    vinext(),
    cloudflare({
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    }),
  ],
});
