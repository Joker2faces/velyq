import { describe, expect, it } from "vitest";
import { normalizeOdds } from "../src/apisports.js";

/**
 * Freshness describes the evidence, not the request.
 *
 * `providerObservedAt` fell back to our own fetch time when the provider sent
 * no `update` field, so a price of entirely unknown age was recorded as having
 * been observed the instant we asked. The freshness policy then called it
 * CURRENT and the decision engine treated it as actionable -- the single
 * worst way for this field to be wrong, because it inverts the product's
 * central claim about its own data.
 *
 * The policy already had somewhere to put an unknown age; the normalizer
 * simply never produced one.
 */

const INGESTED_AT = "2026-09-20T12:00:00.000Z";
const PROVIDER_UPDATE = "2026-09-20T09:15:00.000Z";

function response(overrides: Record<string, unknown> = {}) {
  return {
    fixture: { id: 900001 },
    update: PROVIDER_UPDATE,
    bookmakers: [
      {
        id: 8,
        name: "Test Book",
        bets: [{ id: 1, values: [{ value: "Home", odd: "2.10" }] }],
      },
    ],
    ...overrides,
  };
}

describe("normalizeOdds observation instant", () => {
  it("uses the provider's own instant when it sends one", () => {
    const [observation] = normalizeOdds(response(), "FOOTBALL", INGESTED_AT);
    expect(observation?.providerObservedAt).toBe(PROVIDER_UPDATE);
    /* Our fetch time is kept, separately, and is never confused for it. */
    expect(observation?.ingestedAt).toBe(INGESTED_AT);
  });

  /*
   * The case that matters. Null, not our clock: an undated price must be
   * recognisable as undated all the way down.
   */
  it("reports null rather than our fetch time when the provider is silent", () => {
    for (const update of [undefined, null, "", "   ", 12345]) {
      const [observation] = normalizeOdds(
        response({ update }),
        "FOOTBALL",
        INGESTED_AT,
      );
      expect(observation?.providerObservedAt).toBeNull();
      expect(observation?.ingestedAt).toBe(INGESTED_AT);
    }
  });

  it("never silently substitutes the ingest time", () => {
    const [observation] = normalizeOdds(
      response({ update: undefined }),
      "FOOTBALL",
      INGESTED_AT,
    );
    expect(observation?.providerObservedAt).not.toBe(INGESTED_AT);
  });
});
