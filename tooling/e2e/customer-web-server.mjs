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
  NEXT_PUBLIC_VELYQ_ADMIN_URL: "https://admin.velyq.test",
  VELYQ_SYNTHETIC_PREVIEW: "true",
};

function run(args) {
  return new Promise((resolveProcess, rejectProcess) => {
    const child = spawn(command, args, {
      cwd: repositoryRoot,
      env: environment,
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
  await run(["pnpm", "--filter", "@velyq/web", "build"]);
  if (stopping) process.exit(0);
  server = spawn(
    command,
    ["pnpm", "--filter", "@velyq/web", "exec", "next", "start", "-p", "3100"],
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
