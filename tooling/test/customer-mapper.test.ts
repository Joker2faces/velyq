import { describe, expect, it } from "vitest";
import {
  deriveLineupState,
  selectOutcome,
} from "../../apps/web/app/customer-database";

describe("customer evidence mapper", () => {
  it("prefers the canonical match-result market", () => {
    const canonical = { marketDefinition: { code: "MATCH_RESULT" } };
    const raw = {
      outcomes: [
        { marketDefinition: { code: "TOTALS" }, prediction: null, score: null },
        { ...canonical, prediction: null, score: null },
      ],
    } as never;
    expect(selectOutcome(raw)?.marketDefinition.code).toBe("MATCH_RESULT");
  });

  it("uses the newest lineup observation per team", () => {
    const raw = {
      lineups: [
        {
          teamParticipantId: "home",
          status: "OFFICIAL",
          providerObservedAt: new Date("2026-09-04T09:00:00Z"),
        },
        {
          teamParticipantId: "home",
          status: "UNAVAILABLE",
          providerObservedAt: new Date("2026-09-04T08:00:00Z"),
        },
        {
          teamParticipantId: "away",
          status: "OFFICIAL",
          providerObservedAt: new Date("2026-09-04T09:00:00Z"),
        },
      ],
    } as never;
    expect(deriveLineupState(raw)).toBe("OFFICIAL");
  });
});
