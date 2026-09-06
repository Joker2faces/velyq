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

export interface RuntimeDatabaseSessionOptions {
  /**
   * Bounds how long acquiring a connection may take. Health probes set this so
   * an unreachable origin fails fast as `degraded` instead of holding the
   * request open until the platform kills it.
   */
  readonly connectionTimeoutMillis?: number;
}

export async function openRuntimeDatabaseSession(
  options: RuntimeDatabaseSessionOptions = {},
): Promise<RuntimeDatabaseSession | null> {
  const source = await resolveRuntimeDatabaseSource();
  if (!source) return null;

  const client = createPrivilegedDatabaseClient({
    connectionString: source.connectionString,
    ...(options.connectionTimeoutMillis === undefined
      ? {}
      : { connectionTimeoutMillis: options.connectionTimeoutMillis }),
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
