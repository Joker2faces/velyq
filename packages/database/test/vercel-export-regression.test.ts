import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const workspace = resolve(import.meta.dirname, "../../..");
const adminApp = resolve(workspace, "apps/admin");

describe("database Vercel package integration", () => {
  it("builds the database artifact through the pinned package manager", () => {
    const adminManifest = JSON.parse(
      readFileSync(resolve(workspace, "apps/admin/package.json"), "utf8"),
    ) as { scripts: Record<string, string> };

    expect(adminManifest.scripts["build"]).toBe(
      "corepack pnpm --filter @velyq/database... build && next build --webpack",
    );
  });

  it("exports the privileged client from the built package in the admin app context", () => {
    const manifest = JSON.parse(
      readFileSync(
        resolve(workspace, "packages/database/package.json"),
        "utf8",
      ),
    ) as {
      exports: Record<string, Record<string, string>>;
    };

    expect(manifest.exports["."]?.import).toBe("./dist/index.js");
    expect(manifest.exports["./client"]?.import).toBe("./dist/client.js");

    /*
     * This used to spawn `pnpm --filter @velyq/database... build` here.
     * That was a real `tsc` run writing `packages/database/dist/` in the
     * middle of the suite, while other test files were importing from that
     * same directory -- so whenever `dist` was genuinely stale (i.e. right
     * after anyone edited this package) the rewrite raced their imports and
     * a run failed for reasons unrelated to the assertion. It was also
     * redundant: `pretest` runs `turbo build --filter=./packages/*` before
     * vitest starts, so `dist` is already current here, and the admin build
     * command itself is asserted above and exercised for real by
     * `turbo build` on `@velyq/admin`.
     *
     * What actually matters is below: that the *built* artifact resolves and
     * exports the privileged client when imported from the admin app's own
     * directory, which is where the Vercel regression happened.
     */
    const probe = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        [
          'import * as root from "@velyq/database";',
          'import * as client from "@velyq/database/client";',
          "console.log(JSON.stringify({ root: typeof root.createPrivilegedDatabaseClient, client: typeof client.createPrivilegedDatabaseClient }));",
        ].join(" "),
      ],
      { cwd: adminApp, encoding: "utf8" },
    );

    expect(probe.status, probe.stderr).toBe(0);
    expect(JSON.parse(probe.stdout.trim())).toEqual({
      root: "function",
      client: "function",
    });
  }, 30_000);
});
