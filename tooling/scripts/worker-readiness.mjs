import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const cli = path.join(root, "workers/ingestion/dist/cli.js");
if (!existsSync(cli)) {
  console.error("Worker readiness failed: built ingestion CLI is missing.");
  process.exit(1);
}
const result = spawnSync(process.execPath, [cli, "2026-09-03T11:00:00Z"], {
  cwd: root,
  encoding: "utf8",
  windowsHide: true,
});
if (result.status !== 0 || !result.stdout.includes("sequence-01-opening")) {
  console.error(result.stderr || "Worker readiness replay failed.");
  process.exit(result.status ?? 1);
}
console.log("Worker readiness: PASS");
