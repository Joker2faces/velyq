import { describe, expect, it } from "vitest";

import { validateForecastCycleRequest } from "../app/forecast-cycle/request";

const NOW = new Date("2026-09-25T00:00:00.000Z");

describe("validateForecastCycleRequest", () => {
  it("defaults to a conservative rolling 24h LIVE window when the body is empty", () => {
    const result = validateForecastCycleRequest({}, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.from.toISOString()).toBe(NOW.toISOString());
    expect(result.value.to.getTime() - result.value.from.getTime()).toBe(
      24 * 3_600_000,
    );
    expect(result.value.mode).toBe("LIVE");
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
