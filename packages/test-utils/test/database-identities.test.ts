import { describe, expect, it } from "vitest";

async function loadIdentities(): Promise<Record<string, string>> {
  const helpers = await import("../src/index.js");
  return "databaseTestIdentities" in helpers
    ? helpers.databaseTestIdentities
    : {};
}

describe("database test identities", () => {
  it("provides stable owner, other-user, and administrator UUIDs", async () => {
    expect(await loadIdentities()).toEqual({
      adminUserId: "00000000-0000-4000-8000-000000000003",
      otherUserId: "00000000-0000-4000-8000-000000000002",
      ownerUserId: "00000000-0000-4000-8000-000000000001",
    });
  });
});
