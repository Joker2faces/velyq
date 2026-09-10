import {
  bootstrap,
  connectionString,
  failureLog,
  run,
  stop,
  wsl,
} from "./local-postgres-runtime.mjs";
import { join } from "node:path";

const workspace = process.cwd();

let success = false;
try {
  wsl(bootstrap);
  const output = run(
    process.execPath,
    [
      join(workspace, "node_modules", "vitest", "vitest.mjs"),
      "run",
      "--config",
      "tooling/vitest/vitest.db-benchmark.config.mts",
    ],
    {
      env: { ...process.env, DATABASE_URL: connectionString },
      shell: false,
    },
  );
  console.log(output);
  success = true;
  console.log("PASS odds writer batching benchmark");
} finally {
  wsl(stop, true);
  if (!success)
    console.error(`Local PostgreSQL logs retained at ${failureLog}`);
}
