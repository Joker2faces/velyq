import { describe, expect, it } from "vitest";

import { eventId, playerId, teamId } from "../src/index.js";

describe("event identifiers", () => {
  it("normalizes every UUID-branded identifier to lowercase canonical text", () => {
    const uppercase = "ABCDEF12-3456-4789-ABCD-EF1234567890";
    const lowercase = "abcdef12-3456-4789-abcd-ef1234567890";

    expect(eventId(uppercase)).toEqual({ ok: true, value: lowercase });
    expect(teamId(uppercase)).toEqual({ ok: true, value: lowercase });
    expect(playerId(uppercase)).toEqual({ ok: true, value: lowercase });
  });

  it("rejects values outside canonical hyphenated UUID syntax", () => {
    for (const constructor of [eventId, teamId, playerId]) {
      for (const invalid of [
        "",
        " ",
        "event-1",
        "abcdef1234564789abcdef1234567890",
        "abcdef12-3456-4789-abcd-ef123456789z",
        "abcdef12-3456-4789-abcd-ef1234567890 ",
        null,
      ]) {
        expect(constructor(invalid)).toMatchObject({
          ok: false,
          error: { code: "INVALID_IDENTIFIER" },
        });
      }
    }
  });
});
