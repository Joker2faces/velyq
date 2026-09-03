import { describe, expect, it } from "vitest";

import { eventId, playerId, teamId } from "../src/index.js";

describe("event identifiers", () => {
  it("accepts non-empty canonical identifiers and rejects blank values", () => {
    expect(eventId("event-1")).toMatchObject({ ok: true, value: "event-1" });
    expect(teamId("team-1")).toMatchObject({ ok: true, value: "team-1" });
    expect(playerId("player-1")).toMatchObject({ ok: true, value: "player-1" });
    expect(eventId(" ")).toMatchObject({
      ok: false,
      error: { code: "INVALID_IDENTIFIER" },
    });
  });
});
