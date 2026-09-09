import { spawnSync } from "node:child_process";
import { join } from "node:path";

import {
  bootstrap,
  connectionString,
  failureLog,
  stop,
  wsl,
} from "./local-postgres-runtime.mjs";

/**
 * Runs the admin browser journey against a real migrated, seeded database.
 *
 * The admin journey traces specific seeded rows -- provider run
 * `32000000-...0001` ("sequence-01-opening") through to its prediction, score
 * and quality -- and `tooling/e2e/admin-web-server.mjs` therefore needs a
 * database. Nothing provisioned one, so `pnpm test:e2e` failed the admin
 * project with "heading not found", which reads as a product defect rather
 * than a missing prerequisite. It passes 5/5 once a database exists.
 *
 * The customer project deliberately does NOT need this: it runs on the
 * synthetic corpus with no database at all, which is the whole point of
 * SYNTHETIC_DEMO.
 */
const workspace = process.cwd();

let success = false;
try {
  wsl(bootstrap);
  const result = spawnSync(
    process.execPath,
    [
      join(workspace, "node_modules", "@playwright", "test", "cli.js"),
      "test",
      "--project=admin",
    ],
    {
      cwd: workspace,
      encoding: "utf8",
      stdio: "inherit",
      shell: false,
      env: {
        ...process.env,
        /* The admin server reads this in preference to its default DSN. */
        VELYQ_E2E_DATABASE_URL: connectionString,
      },
    },
  );
  if (result.status !== 0)
    throw new Error(
      `Admin browser journey failed with ${result.status ?? result.signal ?? "an unknown status"}`,
    );
  success = true;
  console.log("PASS admin browser journey against a seeded local database");
} finally {
  wsl(stop, true);
  if (!success)
    console.error(`Local PostgreSQL logs retained at ${failureLog}`);
}
