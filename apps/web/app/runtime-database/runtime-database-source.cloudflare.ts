import { env } from "cloudflare:workers";
import type { RuntimeDatabaseSource } from "./types";

export async function resolveRuntimeDatabaseSource(): Promise<
  RuntimeDatabaseSource | null
> {
  const connectionString = env.HYPERDRIVE?.connectionString;
  return connectionString ? { kind: "hyperdrive", connectionString } : null;
}
