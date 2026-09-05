import { describe, expect, it } from "vitest";

describe("database client composition", () => {
  it("creates a lazy pg pool and Drizzle database without opening a connection", async () => {
    const clientModule = await import("../src/client.js").catch(
      () => undefined,
    );
    const createDatabaseClient = clientModule?.createDatabaseClient;

    expect(typeof createDatabaseClient).toBe("function");
    if (!createDatabaseClient) return;

    const client = createDatabaseClient({
      connectionString: "postgresql://postgres:postgres@127.0.0.1:1/postgres",
      max: 1,
    });

    expect(client.pool.options.connectionString).toBe(
      "postgresql://postgres:postgres@127.0.0.1:1/postgres",
    );
    expect(client.database).toBeDefined();

    await client.close();
  });
});
