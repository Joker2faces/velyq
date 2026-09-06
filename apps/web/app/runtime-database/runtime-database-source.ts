import type { RuntimeDatabaseSource } from "./types";

export async function resolveRuntimeDatabaseSource(): Promise<RuntimeDatabaseSource | null> {
  const connectionString = process.env["VELYQ_DATABASE_URL"];
  return connectionString ? { kind: "node", connectionString } : null;
}
