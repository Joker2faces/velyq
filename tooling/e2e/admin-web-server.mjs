import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(
  fileURLToPath(new URL("../..", import.meta.url)),
);
const command = process.platform === "win32" ? "corepack.cmd" : "corepack";
const environment = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:3101",
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
      const response = await fetch("http://127.0.0.1:3099/health");
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
    ["pnpm", "--filter", "@velyq/admin", "exec", "next", "start", "-p", "3200"],
    {
      cwd: repositoryRoot,
      env: environment,
      stdio: "inherit",
      shell: process.platform === "win32",
      windowsHide: true,
    },
  );
  server.once("error", (error) => {
    console.error(error);
    process.exitCode = 1;
  });
  server.once("exit", (code) => process.exit(code ?? 1));
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
