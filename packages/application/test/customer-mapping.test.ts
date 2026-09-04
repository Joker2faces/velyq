import { describe, expect, it } from "vitest";
import { MappedCustomerQueryService } from "../src/index.js";

describe("mapped customer query boundary", () => {
  const mapper = {
    mapToday: (raw: string) => `today:${raw}`,
    mapMatch: (raw: string) => `match:${raw}`,
  };

  it("maps successful reads", async () => {
    const service = new MappedCustomerQueryService(
      { getToday: async () => "raw", getMatch: async () => "event" },
      mapper,
    );
    await expect(service.getToday(new Date())).resolves.toEqual({
      ok: true,
      value: "today:raw",
    });
    await expect(service.getMatch("id", new Date())).resolves.toEqual({
      ok: true,
      value: "match:event",
    });
  });

  it("returns stable not-found and unavailable states", async () => {
    const service = new MappedCustomerQueryService(
      {
        getToday: async () => {
          throw new Error("db unavailable");
        },
        getMatch: async () => null,
      },
      mapper,
    );
    await expect(service.getToday(new Date())).resolves.toEqual({
      ok: false,
      code: "UNAVAILABLE",
      messageKey: "customerUnavailable",
    });
    await expect(service.getMatch("missing", new Date())).resolves.toEqual({
      ok: false,
      code: "NOT_FOUND",
      messageKey: "matchNotFound",
    });
  });
});
