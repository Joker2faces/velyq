import { describe, expect, it } from "vitest";
import { CustomerQueryService } from "../src/index.js";
import type { CustomerTodayDto } from "@velyq/contracts";

const today = {
  syntheticLabel: "Synthetic data",
  asOf: "2026-09-04T10:00:00.000Z",
  matches: [],
} satisfies CustomerTodayDto;

describe("customer query application boundary", () => {
  it("delegates Today reads to the configured repository", async () => {
    const service = new CustomerQueryService({
      getToday: () => today,
      getMatch: () => null,
    });
    expect(service.getToday()).toEqual(today);
  });

  it("supports asynchronous match repositories", async () => {
    const service = new CustomerQueryService({
      getToday: today,
      getMatch: async () => null,
    });
    await expect(service.getMatch("event-1")).resolves.toBeNull();
  });
});
