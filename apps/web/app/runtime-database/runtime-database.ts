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

/**
 * The bound applied when a caller does not choose one.
 *
 * `pg` defaults `connectionTimeoutMillis` to 0, which means wait forever.
 * Every deliberate probe here passes its own value, but the customer read
 * path -- `requireCustomerSession`, `resolveCustomerContext`,
 * `customerService` -- passed none, so an unreachable database did not fail
 * closed to an honest unavailable state: it held the request open until the
 * platform killed it, and the customer surfaces sat in their loading
 * skeleton indefinitely. That exact failure was reproduced locally against a
 * database URL that could not be reached.
 *
 * Chosen above the 3s health probe (a customer read may legitimately wait a
 * little longer than a liveness check) and well below any platform function
 * limit, so the 503 is ours to report rather than the platform's.
 */
const DEFAULT_CONNECTION_TIMEOUT_MILLIS = 5_000;

export async function openRuntimeDatabaseSession(
  options: RuntimeDatabaseSessionOptions = {},
): Promise<RuntimeDatabaseSession | null> {
  const source = await resolveRuntimeDatabaseSource();
  if (!source) return null;

  const client = createPrivilegedDatabaseClient({
    connectionString: source.connectionString,
    connectionTimeoutMillis:
      options.connectionTimeoutMillis ?? DEFAULT_CONNECTION_TIMEOUT_MILLIS,
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
