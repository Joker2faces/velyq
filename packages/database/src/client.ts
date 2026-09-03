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
