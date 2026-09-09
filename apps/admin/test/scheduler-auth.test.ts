import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { checkSchedulerAuth } from "../app/scheduler-auth";

const SECRET = "scheduler-secret-under-test";

function headers(value?: string): Pick<Headers, "get"> {
  return {
    get: (name: string) =>
      name.toLowerCase() === "authorization" && value !== undefined
        ? value
        : null,
  };
}

describe("checkSchedulerAuth", () => {
  beforeEach(() => {
    process.env["VELYQ_SCHEDULER_SECRET"] = SECRET;
  });
  afterEach(() => {
    delete process.env["VELYQ_SCHEDULER_SECRET"];
  });

  it("accepts the configured scheduler secret", () => {
    expect(checkSchedulerAuth(headers(`Bearer ${SECRET}`))).toEqual({
      ok: true,
    });
  });

  it("rejects a request with no Authorization header", () => {
    expect(checkSchedulerAuth(headers())).toEqual({
      ok: false,
      reason: "UNAUTHORIZED",
    });
  });

  it("rejects the wrong secret", () => {
    expect(checkSchedulerAuth(headers("Bearer not-the-secret"))).toEqual({
      ok: false,
      reason: "UNAUTHORIZED",
    });
  });

  it("rejects a secret of a different length without throwing", () => {
    /*
     * The length check has to come before any constant-time comparison, or a
     * mismatched length would throw rather than deny.
     */
    expect(checkSchedulerAuth(headers("Bearer short"))).toEqual({
      ok: false,
      reason: "UNAUTHORIZED",
    });
  });

  it("rejects a correct secret sent without the Bearer scheme", () => {
    expect(checkSchedulerAuth(headers(SECRET))).toEqual({
      ok: false,
      reason: "UNAUTHORIZED",
    });
  });

  it("distinguishes an unconfigured server from a wrong caller secret", () => {
    /*
     * These must not answer identically. An endpoint with no secret
     * configured that returned UNAUTHORIZED would look exactly like a
     * scheduler holding the wrong key, and the real problem -- a missing
     * server-side variable -- would stay invisible.
     */
    delete process.env["VELYQ_SCHEDULER_SECRET"];
    expect(checkSchedulerAuth(headers(`Bearer ${SECRET}`))).toEqual({
      ok: false,
      reason: "SECRET_NOT_CONFIGURED",
    });
  });

  it("does not accept any other trigger secret in the workspace", () => {
    /*
     * The scheduler holds exactly one capability. If this ever started
     * honouring `CRON_SECRET`, `VELYQ_TRIGGER_SECRET` or the provider key, a
     * leak of the scheduler's value would reach further than the ingestion
     * endpoint -- which is the reason it is a separate name at all.
     */
    for (const name of [
      "CRON_SECRET",
      "VELYQ_TRIGGER_SECRET",
      "VELYQ_INGEST_SECRET",
      "APISPORTS_KEY",
    ]) {
      delete process.env["VELYQ_SCHEDULER_SECRET"];
      process.env[name] = SECRET;
      expect(checkSchedulerAuth(headers(`Bearer ${SECRET}`))).toEqual({
        ok: false,
        reason: "SECRET_NOT_CONFIGURED",
      });
      delete process.env[name];
    }
  });
});
