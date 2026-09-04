import { describe, expect, it } from "vitest";

describe("local database stage plans", () => {
  it("uses only discovered local Supabase CLI commands", async () => {
    const stageModule = await import("../scripts/database-stage.mjs").catch(
      () => undefined,
    );
    const resolveDatabaseStage = stageModule?.resolveDatabaseStage;

    expect(typeof resolveDatabaseStage).toBe("function");
    if (!resolveDatabaseStage) return;

    expect(resolveDatabaseStage("reset")).toEqual([
      ["start"],
      ["db", "reset", "--local"],
    ]);
    expect(resolveDatabaseStage("test")).toEqual([
      ["start"],
      ["db", "reset", "--local"],
      ["test", "db", "--local"],
    ]);
    expect(resolveDatabaseStage("verify")).toEqual([
      ["start"],
      ["db", "reset", "--local"],
      ["migration", "list", "--local"],
      ["test", "db", "--local"],
      ["db", "lint", "--local", "--fail-on", "error"],
      ["db", "advisors", "--local", "--fail-on", "error"],
    ]);
  });

  it("resolves the pinned package entry point without a global CLI", async () => {
    const stageModule = await import("../scripts/database-stage.mjs");

    expect(typeof stageModule.resolveSupabaseInvocation).toBe("function");
    if (typeof stageModule.resolveSupabaseInvocation !== "function") return;

    const invocation = stageModule.resolveSupabaseInvocation();
    expect(invocation.command).toBe(process.execPath);
    expect(invocation.arguments).toHaveLength(1);
    expect(invocation.arguments[0]).toMatch(/[\\/]dist[\\/]supabase\.js$/);
  });
});
