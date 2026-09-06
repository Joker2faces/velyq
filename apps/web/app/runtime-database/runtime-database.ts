import {
  createPrivilegedDatabaseClient,
  type PrivilegedDatabaseClient,
  type PrivilegedVelyqDatabase,
} from "@velyq/database/server";

import { resolveRuntimeDatabaseSource } from "./runtime-database-source";

export interface RuntimeDatabaseSession {
  readonly source: "node" | "hyperdrive";
  readonly client: PrivilegedDatabaseClient;
  readonly database: PrivilegedVelyqDatabase;
  close(): Promise<void>;
}

export async function openRuntimeDatabaseSession(): Promise<RuntimeDatabaseSession | null> {
  const source = await resolveRuntimeDatabaseSource();
  if (!source) return null;

  const client = createPrivilegedDatabaseClient({
    connectionString: source.connectionString,
  });
  let closePromise: Promise<void> | undefined;

  return {
    source: source.kind,
    client,
    database: client.database,
    close: () => {
      closePromise ??= Promise.resolve().then(() => client.close());
      return closePromise;
    },
  };
}
