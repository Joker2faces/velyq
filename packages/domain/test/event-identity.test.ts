import { describe, expect, it } from "vitest";

import { deterministicEventId, eventId } from "../src/index.js";

describe("deterministicEventId", () => {
  it("is stable for the same provider and fixture id, which is what makes ingesting a fixture twice idempotent", () => {
    const first = deterministicEventId("API_SPORTS", "12345");
    const second = deterministicEventId("API_SPORTS", "12345");

    expect(first).toBe(second);
  });

  it("always produces canonical UUID syntax", () => {
    const result = deterministicEventId("API_SPORTS", "12345");

    expect(eventId(result)).toEqual({ ok: true, value: result });
  });

  it("never derives the same id for two different provider fixture ids", () => {
    const a = deterministicEventId("API_SPORTS", "12345");
    const b = deterministicEventId("API_SPORTS", "12346");

    expect(a).not.toBe(b);
  });

  it("never derives the same id for the same fixture id under two different providers", () => {
    /*
     * Two providers can both use "12345" as a fixture id in their own
     * numbering space; the provider code is part of the seed precisely so
     * those never collide into the same VELYQ event.
     */
    const a = deterministicEventId("API_SPORTS", "12345");
    const b = deterministicEventId("FOOTBALL_DATA", "12345");

    expect(a).not.toBe(b);
  });

  it("has no parameter for team names or kickoff time", () => {
    /*
     * Not a behavioural assertion so much as a structural guard against
     * reintroducing the exact thing this function exists to prevent: two
     * fixtures between the same two teams in the same week (a league and a
     * cup pairing them twice) are not unique by "teams + kickoff", and a
     * postponement changes the kickoff on file. The only accepted inputs are
     * the provider code and the provider's own fixture id.
     */
    expect(deterministicEventId).toHaveLength(2);
  });
});
