import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { checkForecastCycleAuth } from "../app/forecast-cycle/auth";

const SECRET = "test-forecast-cycle-secret-value";

function headersWith(authorization: string | null): Pick<Headers, "get"> {
  return {
    get: (name: string) => (name === "authorization" ? authorization : null),
  };
}

describe("checkForecastCycleAuth", () => {
  beforeEach(() => {
    process.env["CRON_SECRET"] = SECRET;
  });
  afterEach(() => {
    delete process.env["CRON_SECRET"];
  });

  it("rejects when no Authorization header is present", () => {
    expect(checkForecastCycleAuth(headersWith(null))).toEqual({
      ok: false,
      reason: "UNAUTHORIZED",
    });
  });

  it("rejects a header that isn't a Bearer token", () => {
    expect(checkForecastCycleAuth(headersWith(`Basic ${SECRET}`))).toEqual({
      ok: false,
      reason: "UNAUTHORIZED",
    });
  });

  it("rejects an incorrect secret", () => {
    expect(checkForecastCycleAuth(headersWith("Bearer wrong-secret"))).toEqual({
      ok: false,
      reason: "UNAUTHORIZED",
    });
  });

  it("rejects a secret that is a prefix or superset of the real one", () => {
    expect(
      checkForecastCycleAuth(headersWith(`Bearer ${SECRET}-extra`)),
    ).toEqual({ ok: false, reason: "UNAUTHORIZED" });
    expect(
      checkForecastCycleAuth(headersWith(`Bearer ${SECRET.slice(0, -1)}`)),
    ).toEqual({ ok: false, reason: "UNAUTHORIZED" });
  });

  it("accepts the correct secret", () => {
    expect(checkForecastCycleAuth(headersWith(`Bearer ${SECRET}`))).toEqual({
      ok: true,
    });
  });

  it("reports SECRET_NOT_CONFIGURED (not UNAUTHORIZED) when no server secret is set at all -- an operator misconfiguration, not a caller's fault", () => {
    delete process.env["CRON_SECRET"];
    expect(checkForecastCycleAuth(headersWith(`Bearer ${SECRET}`))).toEqual({
      ok: false,
      reason: "SECRET_NOT_CONFIGURED",
    });
  });
});
