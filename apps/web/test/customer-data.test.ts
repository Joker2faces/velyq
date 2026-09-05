import { describe, expect, it } from "vitest";
import { customerToday } from "../app/customer-data.js";
import { formatPercent } from "@velyq/ui";

const expectedScenarios = [
  ["74000000-0000-4000-8000-000000000004", "STRONG_EDGE"],
  ["74000000-0000-4000-8000-000000000014", "WAIT_FOR_LINEUP"],
  ["74000000-0000-4000-8000-000000000005", "NO_BET"],
  ["74000000-0000-4000-8000-000000000002", "EXPECTED_LINEUP"],
  ["74000000-0000-4000-8000-000000000031", "EDGE_DISAPPEARED"],
  ["74000000-0000-4000-8000-000000000023", "INSUFFICIENT_DATA"],
  ["74000000-0000-4000-8000-000000000021", "CHANGED_LINEUP"],
] as const;

describe("synthetic customer preview data", () => {
  it("maps every demo row to a discoverable canonical replay scenario", () => {
    expect(
      customerToday.matches.map(({ scenario }) => [
        scenario.id,
        scenario.state,
      ]),
    ).toEqual(expectedScenarios);
  });

  it("uses unique demo event identities outside observation namespaces", () => {
    const eventIds = customerToday.matches.map(({ eventId }) => eventId);

    expect(new Set(eventIds).size).toBe(7);
    expect(eventIds).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^76000000-0000-4000-8000-/),
      ]),
    );
    expect(eventIds.every((id) => id.startsWith("76000000-"))).toBe(true);
  });

  it("links every demo row to its source observations", () => {
    for (const match of customerToday.matches) {
      expect(match.trace.sourceObservationIds?.length).toBeGreaterThan(0);
      expect(
        match.trace.sourceObservationIds?.every((id) =>
          /^(710|720|730)00000-0000-4000-8000-/.test(id),
        ),
      ).toBe(true);
    }
  });

  it("stores price movement as ratios for percent formatting", () => {
    expect(
      formatPercent(customerToday.matches[0]?.movementPercent ?? null),
    ).toBe("-11.9%");
    expect(
      formatPercent(customerToday.matches[4]?.movementPercent ?? null),
    ).toBe("+14.3%");
  });
});
