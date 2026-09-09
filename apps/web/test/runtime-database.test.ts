import type {
  PrivilegedDatabaseClient,
  PrivilegedVelyqDatabase,
} from "@velyq/database/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RuntimeDatabaseSource } from "../app/runtime-database/types";

const runtimeState = vi.hoisted(() => ({
  source: null as RuntimeDatabaseSource | null,
  configs: [] as Array<{
    connectionString?: string;
    connectionTimeoutMillis?: number;
  }>,
  close: vi.fn<() => Promise<void>>(),
  execute: vi.fn<() => Promise<void>>(),
}));

vi.mock("../app/runtime-database/runtime-database-source", () => ({
  resolveRuntimeDatabaseSource: async () => runtimeState.source,
}));

vi.mock("@velyq/database/server", () => ({
  createPrivilegedDatabaseClient: (config: {
    connectionString?: string;
    connectionTimeoutMillis?: number;
  }) => {
    runtimeState.configs.push(config);

    const database = {
      execute: runtimeState.execute,
    } as unknown as PrivilegedVelyqDatabase;

    return {
      access: "privileged-server",
      database,
      pool: {} as PrivilegedDatabaseClient["pool"],
      close: runtimeState.close,
    } satisfies PrivilegedDatabaseClient;
  },
}));

import { openRuntimeDatabaseSession } from "../app/runtime-database/runtime-database";

beforeEach(() => {
  runtimeState.source = null;
  runtimeState.configs.length = 0;
  runtimeState.close.mockReset().mockResolvedValue(undefined);
  runtimeState.execute.mockReset().mockResolvedValue(undefined);
});

describe("runtime database session", () => {
  it("returns null without a configured runtime database source", async () => {
    await expect(openRuntimeDatabaseSession()).resolves.toBeNull();
    expect(runtimeState.configs).toHaveLength(0);
  });

  it.each([
    ["node", "postgres://node-runtime/database"],
    ["hyperdrive", "postgres://hyperdrive/database"],
  ] as const)(
    "constructs a %s session from the resolved connection string",
    async (kind, connectionString) => {
      runtimeState.source = { kind, connectionString };

      const session = await openRuntimeDatabaseSession();

      expect(session).not.toBeNull();
      expect(session?.source).toBe(kind);
      expect(session?.client.database).toBe(session?.database);
      /* This case is about the connection string reaching the client. The
         bound applied alongside it is pinned separately, below. */
      expect(runtimeState.configs).toHaveLength(1);
      expect(runtimeState.configs[0]).toMatchObject({ connectionString });
    },
  );

  it("closes the underlying pool exactly once", async () => {
    runtimeState.source = {
      kind: "hyperdrive",
      connectionString: "postgres://hyperdrive/database",
    };
    const session = await openRuntimeDatabaseSession();

    await Promise.all([session?.close(), session?.close(), session?.close()]);

    expect(runtimeState.close).toHaveBeenCalledTimes(1);
  });

  it("shares one rejected close across concurrent and subsequent callers", async () => {
    runtimeState.source = {
      kind: "hyperdrive",
      connectionString: "postgres://hyperdrive/database",
    };
    const closeError = new Error("pool close failed");
    runtimeState.close.mockRejectedValue(closeError);
    const session = await openRuntimeDatabaseSession();
    if (!session) throw new Error("Expected a configured database session");

    const first = session.close();
    const second = session.close();

    expect(first).toBe(second);
    await expect(first).rejects.toBe(closeError);
    await expect(session.close()).rejects.toBe(closeError);
    expect(runtimeState.close).toHaveBeenCalledTimes(1);
  });

  it("supports deterministic cleanup after a query fails", async () => {
    runtimeState.source = {
      kind: "hyperdrive",
      connectionString: "postgres://hyperdrive/database",
    };
    runtimeState.execute.mockRejectedValueOnce(new Error("query failed"));
    const session = await openRuntimeDatabaseSession();
    if (!session) throw new Error("Expected a configured database session");

    await expect(
      (async () => {
        try {
          await (
            session.database as unknown as { execute(): Promise<void> }
          ).execute();
        } finally {
          await session.close();
        }
      })(),
    ).rejects.toThrow("query failed");
    expect(runtimeState.close).toHaveBeenCalledTimes(1);
  });
});

/*
 * `pg` defaults connectionTimeoutMillis to 0, which means wait forever. The
 * deliberate probes all pass their own bound, but the customer read path
 * passed none -- so an unreachable database did not fail closed to an honest
 * unavailable state, it held the request open until the platform killed it
 * and the customer surfaces sat in their loading skeleton. Reproduced
 * locally against a database URL that could not be reached.
 */
describe("runtime database connection bounds", () => {
  it("bounds connection acquisition even when the caller asks for nothing", async () => {
    runtimeState.source = {
      kind: "node",
      connectionString: "postgres://node-runtime/database",
    };

    await openRuntimeDatabaseSession();

    expect(runtimeState.configs).toHaveLength(1);
    const timeout = runtimeState.configs[0]?.connectionTimeoutMillis;
    expect(timeout).toBeGreaterThan(0);
    expect(timeout).toBeLessThanOrEqual(10_000);
  });

  it("lets a caller choose a tighter bound, such as a health probe", async () => {
    runtimeState.source = {
      kind: "node",
      connectionString: "postgres://node-runtime/database",
    };

    await openRuntimeDatabaseSession({ connectionTimeoutMillis: 3000 });

    expect(runtimeState.configs[0]?.connectionTimeoutMillis).toBe(3000);
  });
});
