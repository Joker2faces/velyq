import { describe, expect, it } from "vitest";

import { profiles } from "../src/schema/index.js";

type ProfileRow = typeof profiles.$inferSelect;
type ProfileCreateInput = Readonly<{
  userId: string;
  displayName?: string | null;
  locale?: string;
  timezone?: string;
}>;
type ProfileCreateOperation = (
  database: unknown,
  input: ProfileCreateInput,
) => Promise<ProfileRow>;

describe("privileged profile repository", () => {
  it("exposes a server-only database client composition", async () => {
    const databaseModule = await import("../src/index.js");
    const createPrivilegedDatabaseClient = Reflect.get(
      databaseModule,
      "createPrivilegedDatabaseClient",
    ) as
      | ((config: { connectionString: string }) => {
          readonly access: string;
          close(): Promise<void>;
        })
      | undefined;

    expect(typeof createPrivilegedDatabaseClient).toBe("function");
    if (!createPrivilegedDatabaseClient) return;

    const client = createPrivilegedDatabaseClient({
      connectionString: "postgresql://postgres:postgres@127.0.0.1:1/postgres",
    });

    expect(client.access).toBe("privileged-server");
    await client.close();
  });

  it("creates a profile through the privileged database writer", async () => {
    const databaseModule = await import("../src/index.js");
    const createProfileWithPrivilegedConnection = Reflect.get(
      databaseModule,
      "createProfileWithPrivilegedConnection",
    ) as ProfileCreateOperation | undefined;

    expect(typeof createProfileWithPrivilegedConnection).toBe("function");
    if (!createProfileWithPrivilegedConnection) return;

    const createdAt = new Date("2026-09-03T12:00:00.000Z");
    const database = {
      insert(table: unknown) {
        if (table !== profiles) {
          throw new Error("Profile repository targeted the wrong table");
        }

        return {
          values(values: ProfileCreateInput) {
            return {
              returning: async (): Promise<ProfileRow[]> => [
                {
                  userId: values.userId,
                  displayName: values.displayName ?? null,
                  locale: values.locale ?? "en",
                  timezone: values.timezone ?? "UTC",
                  createdAt,
                  updatedAt: createdAt,
                },
              ],
            };
          },
        };
      },
    };

    await expect(
      createProfileWithPrivilegedConnection(database, {
        userId: "00000000-0000-4000-8000-000000000010",
        displayName: "Server-created profile",
        locale: "en",
        timezone: "UTC",
      }),
    ).resolves.toEqual({
      userId: "00000000-0000-4000-8000-000000000010",
      displayName: "Server-created profile",
      locale: "en",
      timezone: "UTC",
      createdAt,
      updatedAt: createdAt,
    });
  });
});
