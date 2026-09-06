/**
 * Removes `apps/web/dist` before a Worker build.
 *
 * The prerender step runs the built Worker locally to render pages from it,
 * and `workerd` keeps the asset directory open — on Windows that makes the
 * *next* build abort with an access violation rather than a readable error.
 * Clearing the directory first, with the runtime taken down and a few
 * retries, turns a confusing crash into a reliable build.
 */
import { rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const target = resolve(repoRoot, "apps/web/dist");

if (process.platform === "win32") {
  try {
    execFileSync("taskkill", ["/IM", "workerd.exe", "/F"], { stdio: "ignore" });
  } catch {
    // Nothing left over from a previous prerender.
  }
}

let lastError;
for (let attempt = 0; attempt < 8; attempt += 1) {
  try {
    rmSync(target, { recursive: true, force: true });
    process.exit(0);
  } catch (error) {
    lastError = error;
    // Busy-wait briefly; the handle is released once the runtime exits.
    const until = Date.now() + 750;
    while (Date.now() < until);
  }
}
console.error(`Could not clear ${target}: ${lastError?.message}`);
process.exit(1);
