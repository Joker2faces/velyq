/**
 * Local UX review servers.
 *
 * Starts the built customer app in synthetic-demo mode so every route renders
 * without a Supabase session or a database. Review only — never a deployment
 * path.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const webDirectory = resolve(here, "../../apps/web");

const adminDirectory = resolve(here, "../../apps/admin");

const child = spawn(
  process.execPath,
  [
    resolve(webDirectory, "node_modules/next/dist/bin/next"),
    "start",
    "--port",
    "3100",
  ],
  {
    cwd: webDirectory,
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_ENV: "production",
      VELYQ_SYNTHETIC_PREVIEW: "true",
      VELYQ_CUSTOMER_INTELLIGENCE_MODE: "SYNTHETIC_DEMO",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:3101",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "ux-review-key",
      NEXT_PUBLIC_VELYQ_ADMIN_URL: "https://admin.velyq.test",
    },
  },
);

child.on("exit", (code) => process.exit(code ?? 0));

/*
 * The admin console runs alongside on 3200 for review. Without a database it
 * renders its authorization gate, which is a designed state in its own right.
 */
const admin = spawn(
  process.execPath,
  [
    resolve(adminDirectory, "node_modules/next/dist/bin/next"),
    "start",
    "--port",
    "3200",
  ],
  {
    cwd: adminDirectory,
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_ENV: "production",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:3101",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "ux-review-key",
    },
  },
);

admin.on("exit", (code) => process.exit(code ?? 0));
