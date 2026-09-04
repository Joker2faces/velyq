import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const workspace = resolve(import.meta.dirname, "../../..");
const corepack = process.platform === "win32" ? "corepack.cmd" : "corepack";

describe("built provider artifact", () => {
  it("replays bundled fixtures from compiled JavaScript without ENOENT", () => {
    const build = spawnSync(
      corepack,
      ["pnpm", "--filter", "@velyq/providers", "build"],
      { cwd: workspace, encoding: "utf8", shell: process.platform === "win32" },
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
  });
});
