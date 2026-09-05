import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(
  fileURLToPath(new URL("../..", import.meta.url)),
);
const command = process.platform === "win32" ? "corepack.cmd" : "corepack";

function run(args) {
  return new Promise((resolveProcess, rejectProcess) => {
    const child = spawn(command, args, {
      cwd: repositoryRoot,
      env: process.env,
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

await run(["pnpm", "--filter", "@velyq/database", "build"]);
await run([
  "pnpm",
  "--filter",
  "@velyq/web",
  "exec",
  "next",
  "build",
  "--webpack",
]);
await run([
  "pnpm",
  "--filter",
  "@velyq/admin",
  "exec",
  "next",
  "build",
  "--webpack",
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

server.listen(3099, "127.0.0.1");

function shutdown() {
  server.close(() => process.exit(0));
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
