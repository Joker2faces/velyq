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
  const testOutput = run(
    process.execPath,
    [
      join(workspace, "node_modules", "vitest", "vitest.mjs"),
      "run",
      "--config",
      "tooling/vitest/vitest.db-integration.config.mts",
    ],
    {
      env: { ...process.env, DATABASE_URL: connectionString },
      shell: false,
    },
  );
  console.log(testOutput);
  success = true;
  console.log("PASS local PostgreSQL migration, seed and DB integration suite");
} finally {
  wsl(stop, true);
  if (!success)
    console.error(`Local PostgreSQL logs retained at ${failureLog}`);
}
