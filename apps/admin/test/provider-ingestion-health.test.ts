import { describe, expect, it } from "vitest";

import { deriveProviderIngestionHealth } from "../app/provider-ingestion-health.js";

const base = {
  status: "COMPLETED" as const,
  providerCallsUsed: 0,
  discoveryDatesRequested: [] as readonly string[],
  oddsCandidates: 0,
  oddsRequestsAttempted: 0,
  lineupCandidates: 0,
  lineupRequestsAttempted: 0,
  resultCandidates: 0,
  resultRequestsAttempted: 0,
  skippedByReason: {} as Readonly<Record<string, number>>,
  errorsByReason: {} as Readonly<Record<string, number>>,
};

describe("live provider-ingestion health derivation", () => {
  it.each([
    {
      name: "idle only when no work or diagnostic reason exists",
      input: base,
      expected: "HEALTHY_IDLE",
    },
    {
      name: "quota blocked using an emitted ODDS reason",
      input: {
        ...base,
        oddsCandidates: 2,
        skippedByReason: { ODDS_QUOTA_EXHAUSTED: 1 },
      },
      expected: "QUOTA_BLOCKED",
    },
    {
      name: "purpose budget blocked using the quota policy reason",
      input: {
        ...base,
        resultCandidates: 2,
        skippedByReason: { RESULT_PURPOSE_BUDGET_SPENT: 1 },
      },
      expected: "BUDGET_BLOCKED",
    },
    {
      name: "due work deferred using an emitted ingestion reason",
      input: {
        ...base,
        oddsCandidates: 2,
        skippedByReason: { ODDS_DEFERRED_AFTER_DISCOVERY: 1 },
      },
      expected: "WORK_BLOCKED",
    },
    {
      name: "completed error outranks every zero-call blocked state",
      input: {
        ...base,
        resultCandidates: 1,
        errorsByReason: { RESULT_RATE_LIMITED: 1 },
      },
      expected: "COMPLETED_WITH_ERRORS",
    },
  ])("classifies $name", ({ input, expected }) => {
    expect(deriveProviderIngestionHealth(input)).toBe(expected);
  });
});
