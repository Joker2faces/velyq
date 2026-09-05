import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const workspace = resolve(import.meta.dirname, "../../..");
const corepack = process.platform === "win32" ? "corepack.cmd" : "corepack";

describe("built provider artifact", () => {
  it("replays bundled fixtures from compiled JavaScript without ENOENT", () => {
    const build = spawnSync(
      process.platform === "win32"
        ? (process.env["ComSpec"] ?? "cmd.exe")
        : corepack,
      process.platform === "win32"
        ? [
            "/d",
            "/s",
            "/c",
            "corepack pnpm turbo build --filter=@velyq/providers...",
          ]
        : ["pnpm", "turbo", "build", "--filter=@velyq/providers..."],
      { cwd: workspace, encoding: "utf8", shell: false },
    );
    expect(build.status, build.stderr).toBe(0);

    const replay = spawnSync(
      process.execPath,
      [resolve(workspace, "packages/providers/dist/cli.js")],
      { cwd: workspace, encoding: "utf8" },
    );
    expect(replay.status, replay.stderr).toBe(0);
    expect(JSON.parse(replay.stdout)).toEqual(
      expect.objectContaining({
        results: expect.arrayContaining([
          expect.objectContaining({ sequenceName: "sequence-04-repriced" }),
        ]),
      }),
    );
  }, 30_000);
});
