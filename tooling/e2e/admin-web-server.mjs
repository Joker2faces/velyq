import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(
  fileURLToPath(new URL("../..", import.meta.url)),
);
const command = process.platform === "win32" ? "corepack.cmd" : "corepack";
const buildPort = Number(process.env.VELYQ_E2E_BUILD_PORT);
const authPort = Number(process.env.VELYQ_E2E_AUTH_PORT);
const adminPort = Number(process.env.VELYQ_E2E_ADMIN_PORT);
if (
  !Number.isSafeInteger(buildPort) ||
  !Number.isSafeInteger(authPort) ||
  !Number.isSafeInteger(adminPort)
) {
  throw new Error("Playwright did not provide valid admin E2E ports");
}
const environment = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${authPort}`,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "e2e-publishable-key",
  VELYQ_E2E_INSECURE_COOKIES: "true",
  VELYQ_DATABASE_URL:
    process.env.VELYQ_E2E_DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
};

async function waitForBuild() {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${buildPort}/health`);
      if (response.ok) return;
    } catch {
      // The build coordinator may not be listening yet.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw new Error("Timed out waiting for the coordinated E2E app build");
}

let server;
let stopping = false;

function stop() {
  if (stopping) return;
  stopping = true;
  server?.kill();
}

process.once("SIGINT", stop);
process.once("SIGTERM", stop);

try {
  await waitForBuild();
  if (stopping) process.exit(0);
  server = spawn(
    command,
    [
      "pnpm",
      "--filter",
      "@velyq/admin",
      "exec",
      "next",
      "start",
      "-p",
      String(adminPort),
    ],
    {
      cwd: repositoryRoot,
      env: environment,
      stdio: "inherit",
      shell: process.platform === "win32",
      windowsHide: true,
    },
  );
  server.once("error", (error) => {
    console.error(
      `Unable to start the admin E2E app on port ${adminPort}:`,
      error,
    );
    process.exitCode = 1;
  });
  server.once("exit", (code, signal) => {
    if (!stopping) {
      console.error(
        `Admin E2E app exited during startup with ${code ?? signal ?? "an unknown status"}`,
      );
    }
    process.exit(code ?? (stopping ? 0 : 1));
  });
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
