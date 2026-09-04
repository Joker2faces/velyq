import { createPrivilegedDatabaseClient } from "@velyq/database";
import { runDurablePipelineJobOnce } from "./index.js";

const databaseUrl = process.env["VELYQ_DATABASE_URL"];
if (!databaseUrl) throw new Error("VELYQ_DATABASE_URL_REQUIRED");

const client = createPrivilegedDatabaseClient({
  connectionString: databaseUrl,
});
try {
  const result = await runDurablePipelineJobOnce({
    database: client.database,
    workerId: process.env["VELYQ_WORKER_ID"] ?? "prediction-worker",
    now: new Date(process.env["VELYQ_FIXED_CLOCK"] ?? Date.now()),
    leaseDurationMs: Number(process.env["VELYQ_LEASE_DURATION_MS"] ?? 30_000),
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
} finally {
  await client.close();
}
