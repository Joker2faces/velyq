import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(
  fileURLToPath(new URL("../..", import.meta.url)),
);
const command = process.platform === "win32" ? "corepack.cmd" : "corepack";
const buildPort = Number(process.env.VELYQ_E2E_BUILD_PORT);
const authPort = Number(process.env.VELYQ_E2E_AUTH_PORT);
if (!Number.isSafeInteger(buildPort) || !Number.isSafeInteger(authPort)) {
  throw new Error("Playwright did not provide valid E2E build/auth ports");
}
const buildEnvironment = {
  ...process.env,
  NEXT_PUBLIC_VELYQ_ADMIN_URL: "https://admin.velyq.test",
  NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${authPort}`,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "e2e-publishable-key",
  VELYQ_DATABASE_URL:
    process.env.VELYQ_E2E_DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
};

function run(args) {
  return new Promise((resolveProcess, rejectProcess) => {
    const child = spawn(command, args, {
      cwd: repositoryRoot,
      env: buildEnvironment,
      stdio: "inherit",
      shell: process.platform === "win32",
      windowsHide: true,
    });
    child.once("error", rejectProcess);
    child.once("exit", (code, signal) => {
      if (code === 0) resolveProcess();
      else rejectProcess(new Error(`Command exited with ${code ?? signal}`));
    });
  });
}

for (const app of ["web", "admin"]) {
  rmSync(resolve(repositoryRoot, "apps", app, ".next"), {
    recursive: true,
    force: true,
  });
}

await run([
  "pnpm",
  "turbo",
  "build",
  "--filter=@velyq/web...",
  "--filter=@velyq/admin...",
]);

const server = createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: "ready" }));
    return;
  }
  response.writeHead(404);
  response.end();
});

server.once("error", (error) => {
  console.error(
    `Unable to start the E2E build coordinator on port ${buildPort}:`,
    error,
  );
  process.exit(1);
});
server.listen(buildPort, "127.0.0.1");

function shutdown() {
  server.close(() => process.exit(0));
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
