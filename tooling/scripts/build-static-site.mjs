/**
 * Turns the built Worker into a mostly-static site.
 *
 * Runs the freshly built Worker locally, asks it for each public route once,
 * and writes the resulting HTML into the asset directory. Cloudflare then
 * serves those paths straight from its asset layer and never invokes the
 * Worker for them — which is the difference between fitting in the Workers
 * Free 10ms CPU allowance and not.
 *
 * Usage: node tooling/scripts/build-static-site.mjs
 * Expects `pnpm build:vinext` to have run already.
 */
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

/* Resolve from this file, not the caller's cwd: the build runs it from
   apps/web while a developer runs it from the repository root. */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const webDirectory = resolve(repoRoot, "apps/web");
const distServer = resolve(webDirectory, "dist/server/wrangler.json");
if (!existsSync(distServer)) {
  console.error("No Worker build found. Run `pnpm build:vinext` first.");
  process.exit(1);
}

const PORT = Number(process.env["VELYQ_PRERENDER_PORT"] ?? 8811);
const command = process.platform === "win32" ? "npx.cmd" : "npx";

const worker = spawn(
  command,
  [
    "wrangler",
    "dev",
    "--config",
    "dist/server/wrangler.json",
    "--port",
    String(PORT),
    "--local",
    "--inspector-port",
    String(PORT + 1000),
  ],
  {
    cwd: webDirectory,
    env: {
      ...process.env,
      // Prerendering only touches public pages, which never query the
      // database — but wrangler refuses to start a Hyperdrive binding
      // locally without some connection string, so give it an unused one.
      CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE:
        "postgresql://prerender:unused@127.0.0.1:5999/unused",
    },
    stdio: "ignore",
    shell: process.platform === "win32",
  },
);

let exitCode = 1;
try {
  const deadline = Date.now() + 120_000;
  let ready = false;
  while (Date.now() < deadline && !ready) {
    try {
      const probe = await fetch(`http://127.0.0.1:${PORT}/terms`);
      ready = probe.ok;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  if (!ready) throw new Error("local Worker did not become ready");

  const { execFileSync } = await import("node:child_process");
  execFileSync(
    process.execPath,
    [
      resolve(repoRoot, "tooling/scripts/prerender-public-routes.mjs"),
      `http://127.0.0.1:${PORT}`,
      resolve(repoRoot, "apps/web/dist/client"),
    ],
    { stdio: "inherit", cwd: repoRoot },
  );
  execFileSync(
    process.execPath,
    [
      resolve(repoRoot, "tooling/scripts/static-headers.mjs"),
      resolve(repoRoot, "apps/web/dist/client/_headers"),
    ],
    { stdio: "inherit", cwd: repoRoot },
  );
  exitCode = 0;
} catch (error) {
  console.error(`Prerender failed: ${error.message}`);
} finally {
  worker.kill();
  /*
   * wrangler runs the actual runtime as a `workerd` grandchild, so killing
   * wrangler leaves it behind — and while it lives it holds the asset
   * directory open on Windows, which makes the *next* build crash rather
   * than fail cleanly. Take the whole tree down explicitly.
   */
  const { execFileSync } = await import("node:child_process");
  try {
    if (process.platform === "win32") {
      execFileSync("taskkill", ["/PID", String(worker.pid), "/T", "/F"], {
        stdio: "ignore",
      });
    }
  } catch {
    // Already gone.
  }
  try {
    if (process.platform === "win32")
      execFileSync("taskkill", ["/IM", "workerd.exe", "/F"], {
        stdio: "ignore",
      });
  } catch {
    // No stray runtime left.
  }
  /*
   * `wrangler dev` survives the tree kill above often enough to matter: it
   * re-parents away from the shell this spawned, then keeps a handle on
   * `dist` and makes the *next* build fail in confusing ways. Match it by the
   * port this run chose — precise enough not to touch anything else on the
   * machine, including other checkouts of this repo.
   */
  try {
    if (process.platform === "win32") {
      const listing = execFileSync(
        "powershell",
        [
          "-NoProfile",
          "-Command",
          `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*wrangler*' -and $_.CommandLine -like '*${PORT}*' } | ForEach-Object { $_.ProcessId }`,
        ],
        { encoding: "utf8" },
      );
      for (const pid of listing.split(/\s+/).filter(Boolean)) {
        try {
          execFileSync("taskkill", ["/PID", pid, "/T", "/F"], {
            stdio: "ignore",
          });
        } catch {
          // Already exited.
        }
      }
    }
  } catch {
    // Nothing matched.
  }
  await new Promise((r) => setTimeout(r, 2000));
}
process.exit(exitCode);
