/**
 * Removes `apps/web/dist` before a Worker build.
 *
 * The prerender step runs the built Worker locally to render pages from it,
 * and `workerd` keeps the asset directory open — on Windows that makes the
 * *next* build abort with an access violation rather than a readable error.
 * Clearing the directory first, with a few retries, turns a confusing crash
 * into a reliable build.
 */
import { rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const target = resolve(repoRoot, "apps/web/dist");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let lastError;
for (let attempt = 0; attempt < 10; attempt += 1) {
  try {
    rmSync(target, { recursive: true, force: true });
    lastError = undefined;
    break;
  } catch (error) {
    lastError = error;
    await sleep(1000);
  }
}

if (lastError) {
  console.error(
    `Could not clear ${target}: ${lastError.message}\n` +
      "A local Worker from a previous prerender may still be running.",
  );
  process.exit(1);
}
