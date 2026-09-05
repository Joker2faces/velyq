import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const workspace = resolve(import.meta.dirname, "../../..");
const adminApp = resolve(workspace, "apps/admin");
const corepack = process.platform === "win32" ? "corepack.cmd" : "corepack";

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

    const build = spawnSync(
      process.platform === "win32"
        ? (process.env["ComSpec"] ?? "cmd.exe")
        : corepack,
      process.platform === "win32"
        ? ["/d", "/s", "/c", "corepack pnpm --filter @velyq/database... build"]
        : ["pnpm", "--filter", "@velyq/database...", "build"],
      { cwd: workspace, encoding: "utf8", shell: false },
    );

    expect(build.status, build.stderr).toBe(0);

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
