import { describe, expect, it } from "vitest";

import {
  evaluateProviderAction,
  parseProviderDataPolicy,
  syntheticProviderPolicyDocument,
} from "../src/index.js";

describe("provider data policy", () => {
  it("parses the effective-dated synthetic policy from unknown input", () => {
    const parsed = parseProviderDataPolicy(syntheticProviderPolicyDocument);

    expect(parsed).toEqual({
      ok: true,
      value: expect.objectContaining({
        providerCode: "SYNTHETIC_FIXTURES",
        version: "synthetic-fixtures.v1",
        effectiveFrom: "2026-01-01T00:00:00Z",
        effectiveTo: null,
      }),
    });
  });

  it.each([
    ["RETAIN_NORMALIZED", undefined, "NORMALIZED_ODDS"],
    ["REPLAY", undefined, "REPOSITORY_FIXTURE"],
    ["CACHE", undefined, "REPOSITORY_FIXTURE"],
    ["DISPLAY", "CUSTOMER", "NORMALIZED_ODDS"],
    ["DISPLAY", "ADMIN", "NORMALIZED_LINEUP"],
    ["BACKTEST", undefined, "NORMALIZED_ODDS"],
  ] as const)(
    "permits %s for the governed synthetic data category",
    (action, audience, dataCategory) => {
      const parsed = parseProviderDataPolicy(syntheticProviderPolicyDocument);
      if (!parsed.ok) throw new Error("fixture policy must parse");

      expect(
        evaluateProviderAction(parsed.value, {
          action,
          asOf: "2026-09-03T10:00:00Z",
          environment: "DEVELOPMENT",
          territory: "ZZ",
          dataCategory,
          attributionPresent: true,
          ...(audience === undefined ? {} : { audience }),
        }),
      ).toEqual({ allowed: true, policyVersion: "synthetic-fixtures.v1" });
    },
  );

  it.each([
    ["RETAIN_RAW", undefined, "ACTION_NOT_GRANTED"],
    ["EXPORT", undefined, "ACTION_NOT_GRANTED"],
    ["DISPLAY", "PUBLIC", "AUDIENCE_NOT_GRANTED"],
  ] as const)(
    "denies %s without an applicable grant",
    (action, audience, reason) => {
      const parsed = parseProviderDataPolicy(syntheticProviderPolicyDocument);
      if (!parsed.ok) throw new Error("fixture policy must parse");

      expect(
        evaluateProviderAction(parsed.value, {
          action,
          asOf: "2026-09-03T10:00:00Z",
          environment: "DEVELOPMENT",
          territory: "ZZ",
          dataCategory: "NORMALIZED_ODDS",
          attributionPresent: true,
          ...(audience === undefined ? {} : { audience }),
        }),
      ).toEqual({
        allowed: false,
        policyVersion: "synthetic-fixtures.v1",
        reason,
      });
    },
  );

  it("denies use outside the policy effective window", () => {
    const parsed = parseProviderDataPolicy(syntheticProviderPolicyDocument);
    if (!parsed.ok) throw new Error("fixture policy must parse");

    expect(
      evaluateProviderAction(parsed.value, {
        action: "REPLAY",
        asOf: "2025-12-31T23:59:59Z",
        environment: "TEST",
        territory: "ZZ",
        dataCategory: "REPOSITORY_FIXTURE",
        attributionPresent: true,
      }),
    ).toEqual({
      allowed: false,
      policyVersion: "synthetic-fixtures.v1",
      reason: "POLICY_NOT_EFFECTIVE",
    });
  });

  it("rejects malformed dates and scattered boolean policies", () => {
    expect(
      parseProviderDataPolicy({
        providerCode: "SYNTHETIC_FIXTURES",
        version: "bad.v1",
        effectiveFrom: "not-a-date",
        retainNormalized: true,
      }),
    ).toEqual(expect.objectContaining({ ok: false }));
  });

  it("rejects a forged policy passed directly to the evaluator", () => {
    expect(
      evaluateProviderAction(
        {
          providerCode: "SYNTHETIC_FIXTURES",
          version: "forged.v1",
          providerMode: "SYNTHETIC",
          effectiveFrom: "not-a-time",
          effectiveTo: null,
          grants: [{ action: "EXPORT" }],
        },
        {
          action: "EXPORT",
          asOf: "2026-09-03T10:00:00Z",
          environment: "DEVELOPMENT",
          territory: "ZZ",
          dataCategory: "NORMALIZED_ODDS",
          attributionPresent: true,
        },
      ),
    ).toEqual({
      allowed: false,
      policyVersion: null,
      reason: "INVALID_POLICY",
    });
  });

  it("rejects an unvalidated action request", () => {
    expect(
      evaluateProviderAction(syntheticProviderPolicyDocument, {
        action: "REPLAY",
        asOf: "yesterday",
        environment: "DEVELOPMENT",
        territory: "ZZ",
        dataCategory: "REPOSITORY_FIXTURE",
        attributionPresent: true,
      }),
    ).toEqual({
      allowed: false,
      policyVersion: "synthetic-fixtures.v1",
      reason: "INVALID_REQUEST",
    });
  });
});
