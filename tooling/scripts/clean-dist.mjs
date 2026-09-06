/**
 * Clears `apps/web/dist` before a Worker build.
 *
 * This matters for correctness, not tidiness: the prerender step renders
 * pages by asking the freshly built Worker for them, so a `dist/server` left
 * over from an earlier build produces HTML referencing the *previous*
 * build's client chunks. That deploys happily and then 404s every script.
 *
 * The directory is moved aside rather than deleted in place. A recursive
 * delete of the built tree crashes Node outright on this checkout (it lives
 * under OneDrive), whereas a rename is a single cheap operation that either
 * works or fails cleanly. Removing the renamed copy afterwards is
 * best-effort: if the filesystem is still holding it, leaving it behind is
 * harmless — the build no longer sees it.
 */
import { renameSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const target = resolve(repoRoot, "apps/web/dist");
const parked = `${target}.old-${Date.now()}`;

/*
 * Best-effort, deliberately. On this checkout the directory is intermittently
 * held open by the OS (OneDrive sync, or a workerd still shutting down), and
 * failing the build for that would be worse than the staleness it guards
 * against — especially because the staleness itself is caught for certain
 * further down: the prerender step refuses to write any page referencing an
 * asset that is not present in the same build.
 */
try {
  renameSync(target, parked);
} catch (error) {
  if (error?.code === "ENOENT") process.exit(0);
  console.warn(
    `Could not move ${target} aside (${error.code ?? error.message}); ` +
      "the build will overwrite it. Stale output is caught by the " +
      "prerender asset check.",
  );
  process.exit(0);
}

try {
  rmSync(parked, { recursive: true, force: true });
} catch {
  console.warn(`Left ${parked} behind; it is out of the build's way.`);
}
