import { describe, expect, it, vi } from "vitest";

import { runWorkerReadiness } from "../scripts/worker-readiness.mjs";

const successfulResult = {
  pid: 100,
  output: [null, "", ""],
  stdout: "",
  stderr: "",
  status: 0,
  signal: null,
};

function readinessOptions() {
  return {
    root: "C:/synthetic/velyq",
    existsSync: vi.fn(() => true),
    spawnSync: vi
      .fn()
      .mockReturnValueOnce(successfulResult)
      .mockReturnValueOnce({
        ...successfulResult,
        stdout: '{"results":[{"sequenceName":"sequence-01-opening"}]}\n',
      }),
  };
}

describe("built worker readiness", () => {
  it("passes after resolving both consumers and replaying without live secrets", () => {
    const options = readinessOptions();
    const result = runWorkerReadiness(options);

    expect(result).toEqual({ ok: true, message: "Worker readiness: PASS" });
    expect(options.spawnSync).toHaveBeenCalledTimes(2);
    expect(options.spawnSync.mock.calls[0]?.[1]).toContain(
      "workers/ingestion/dist/index.js",
    );
    expect(options.spawnSync.mock.calls[0]?.[1]).toContain(
      "workers/prediction/dist/src/index.js",
    );
    const replayOptions = options.spawnSync.mock.calls[1]?.[2];
    expect(replayOptions?.env).not.toHaveProperty("VELYQ_DATABASE_URL");
    expect(replayOptions?.env).not.toHaveProperty("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("fails when a required built worker artifact is absent", () => {
    const options = readinessOptions();
    options.existsSync.mockReturnValueOnce(false);

    expect(runWorkerReadiness(options)).toMatchObject({
      ok: false,
      message: expect.stringMatching(/built ingestion consumer is missing/i),
    });
    expect(options.spawnSync).not.toHaveBeenCalled();
  });

  it.each([
    [1, "prediction consumer"],
    [2, "ingestion replay CLI"],
  ])("identifies missing artifact %i as the %s", (missingIndex, label) => {
    const options = readinessOptions();
    options.existsSync.mockReset();
    for (let index = 0; index <= missingIndex; index += 1) {
      options.existsSync.mockReturnValueOnce(index !== missingIndex);
    }

    expect(runWorkerReadiness(options)).toMatchObject({
      ok: false,
      message: expect.stringContaining(label),
    });
    expect(options.spawnSync).not.toHaveBeenCalled();
  });

  it("reports dependency and replay failures", () => {
    const dependencyFailure = readinessOptions();
    dependencyFailure.spawnSync.mockReset().mockReturnValue({
      ...successfulResult,
      status: 1,
      stderr: "ERR_MODULE_NOT_FOUND",
    });
    expect(runWorkerReadiness(dependencyFailure)).toMatchObject({
      ok: false,
      message: expect.stringMatching(/dependencies.*ERR_MODULE_NOT_FOUND/i),
    });

    const replayFailure = readinessOptions();
    replayFailure.spawnSync
      .mockReset()
      .mockReturnValueOnce(successfulResult)
      .mockReturnValueOnce({
        ...successfulResult,
        status: 2,
        stderr: "replay exploded",
      });
    expect(runWorkerReadiness(replayFailure)).toMatchObject({
      ok: false,
      message: expect.stringMatching(/replay.*replay exploded/i),
    });
  });

  it("reports a bounded timeout", () => {
    const options = readinessOptions();
    options.spawnSync.mockReset().mockReturnValue({
      ...successfulResult,
      status: null,
      error: Object.assign(new Error("spawnSync ETIMEDOUT"), {
        code: "ETIMEDOUT",
      }),
    });

    expect(runWorkerReadiness({ ...options, timeoutMs: 25 })).toEqual({
      ok: false,
      message: "Worker readiness dependency check timed out after 25ms.",
    });
  });

  it("reports a bounded replay timeout", () => {
    const options = readinessOptions();
    options.spawnSync
      .mockReset()
      .mockReturnValueOnce(successfulResult)
      .mockReturnValueOnce({
        ...successfulResult,
        status: null,
        error: Object.assign(new Error("spawnSync ETIMEDOUT"), {
          code: "ETIMEDOUT",
        }),
      });

    expect(runWorkerReadiness({ ...options, timeoutMs: 40 })).toEqual({
      ok: false,
      message: "Worker readiness replay timed out after 40ms.",
    });
  });

  it("reports malformed replay output without exposing environment secrets", () => {
    const options = readinessOptions();
    options.spawnSync
      .mockReset()
      .mockReturnValueOnce(successfulResult)
      .mockReturnValueOnce({
        ...successfulResult,
        stdout: '{"results":[]}',
      });

    expect(
      runWorkerReadiness({
        ...options,
        environment: {
          VELYQ_DATABASE_URL: "postgresql://secret.example.test/velyq",
          VELYQ_PROVIDER_ID: "secret-provider-id",
          SAFE_VALUE: "preserved",
        },
      }),
    ).toMatchObject({
      ok: false,
      message: expect.stringMatching(/canonical sequence result is missing/i),
    });
    expect(options.spawnSync.mock.calls[1]?.[2]?.env).toEqual({
      SAFE_VALUE: "preserved",
    });
  });
});
