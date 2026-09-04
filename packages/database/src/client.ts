import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";

import { databaseSchema } from "./schema/index.js";

export type VelyqDatabase = NodePgDatabase<typeof databaseSchema>;
export type RepositoryTransaction = Parameters<
  Parameters<VelyqDatabase["transaction"]>[0]
>[0];

export interface RepositoryTransactionRunner {
  transaction<T>(
    work: (transaction: RepositoryTransaction) => Promise<T>,
  ): Promise<T>;
}

export interface DatabaseClient {
  readonly database: VelyqDatabase;
  readonly pool: Pool;
  close(): Promise<void>;
}

export type PrivilegedVelyqDatabase = VelyqDatabase &
  Readonly<{ __access: "privileged-server" }>;

export interface PrivilegedDatabaseClient extends Omit<
  DatabaseClient,
  "database"
> {
  readonly access: "privileged-server";
  readonly database: PrivilegedVelyqDatabase;
}

// Keep the privileged server constructor in the package build graph so app
// deployments cannot reuse a stale database artifact.
export function createDatabaseClient(config: PoolConfig): DatabaseClient {
  const pool = new Pool(config);
  const database = drizzle(pool, { schema: databaseSchema });

  return {
    database,
    pool,
    close: async () => {
      await pool.end();
    },
  };
}

export function createPrivilegedDatabaseClient(
  config: PoolConfig,
): PrivilegedDatabaseClient {
  const client = createDatabaseClient(config);

  return {
    ...client,
    access: "privileged-server",
    database: client.database as PrivilegedVelyqDatabase,
  };
}
