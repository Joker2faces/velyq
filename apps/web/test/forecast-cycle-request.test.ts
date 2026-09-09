import { describe, expect, it } from "vitest";

import { validateForecastCycleRequest } from "../app/forecast-cycle/request";

/*
 * Deliberately not midnight. The production cron fires at 04:00 UTC, and a
 * midnight `now` cannot distinguish a window anchored to the start of the UTC
 * day from one anchored to the firing time -- which is why the earlier
 * midnight-based clock here passed while the default silently excluded the
 * first hours of the customer's own Today.
 */
const NOW = new Date("2026-09-25T04:00:00.000Z");
const START_OF_DAY = "2026-09-25T00:00:00.000Z";

describe("validateForecastCycleRequest", () => {
  it("defaults to the current UTC day, not to a window starting when the cron happened to fire", () => {
    const result = validateForecastCycleRequest({}, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.from.toISOString()).toBe(START_OF_DAY);
    /*
     * Exactly the customer's Today window: whatever kicks off during the day
     * being displayed is in scope, including before the cron ran.
     */
    expect(result.value.to.toISOString()).toBe("2026-09-26T00:00:00.000Z");
    expect(result.value.to.getTime() - result.value.from.getTime()).toBe(
      24 * 3_600_000,
    );
    expect(result.value.mode).toBe("LIVE");
  });

  it("covers a fixture kicking off before the cron's own firing time", () => {
    const result = validateForecastCycleRequest({}, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const earlyKickoff = new Date("2026-09-25T01:30:00.000Z");
    expect(earlyKickoff.getTime()).toBeGreaterThanOrEqual(
      result.value.from.getTime(),
    );
    expect(earlyKickoff.getTime()).toBeLessThan(result.value.to.getTime());
  });

  it("still honours an explicit from, which is not day-anchored", () => {
    const result = validateForecastCycleRequest(
      { from: "2026-09-25T18:00:00.000Z" },
      NOW,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.from.toISOString()).toBe("2026-09-25T18:00:00.000Z");
    expect(result.value.to.toISOString()).toBe("2026-09-26T18:00:00.000Z");
  });

  it("accepts an explicit, valid window and mode", () => {
    const result = validateForecastCycleRequest(
      {
        from: "2026-09-25T00:00:00.000Z",
        to: "2026-09-25T12:00:00.000Z",
        mode: "SYNTHETIC_DEMO",
      },
      NOW,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.mode).toBe("SYNTHETIC_DEMO");
  });

  it("rejects an unparseable from timestamp", () => {
    const result = validateForecastCycleRequest({ from: "not-a-date" }, NOW);
    expect(result).toEqual({ ok: false, reason: "INVALID_FROM" });
  });

  it("rejects an unparseable to timestamp", () => {
    const result = validateForecastCycleRequest({ to: "not-a-date" }, NOW);
    expect(result).toEqual({ ok: false, reason: "INVALID_TO" });
  });

  it("rejects from >= to", () => {
    const result = validateForecastCycleRequest(
      { from: "2026-09-25T12:00:00.000Z", to: "2026-09-25T12:00:00.000Z" },
      NOW,
    );
    expect(result).toEqual({ ok: false, reason: "FROM_NOT_BEFORE_TO" });
  });

  it("rejects a window wider than the maximum, refusing an accidental full-history scan", () => {
    const result = validateForecastCycleRequest(
      { from: "2026-09-25T00:00:00.000Z", to: "2026-10-25T00:00:00.000Z" },
      NOW,
    );
    expect(result).toEqual({ ok: false, reason: "WINDOW_TOO_LARGE" });
  });

  it("rejects an unsupported mode", () => {
    const result = validateForecastCycleRequest(
      { mode: "SOMETHING_ELSE" },
      NOW,
    );
    expect(result).toEqual({ ok: false, reason: "UNSUPPORTED_MODE" });
  });

  it("treats a non-object body the same as an empty one, rather than throwing", () => {
    const result = validateForecastCycleRequest("not-an-object", NOW);
    expect(result.ok).toBe(true);
  });
});
