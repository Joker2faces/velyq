import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { AdminProviderIngestionRunDto } from "../app/admin-api.js";
import { ProviderIngestionRunView } from "../app/provider-ingestion-run-view.js";

const baseRun: AdminProviderIngestionRunDto = {
  id: "00000000-0000-4000-8000-000000000005",
  providerCode: "api-sports",
  trigger: "SCHEDULER",
  quotaDay: "2026-09-03",
  quotaPolicyVersion: "api-sports.v1",
  status: "COMPLETED",
  runHealth: "HEALTHY_IDLE",
  resultOutcome: "NOT_ATTEMPTED",
  providerCallsUsed: 0,
  quotaStateAtStart: "HEALTHY",
  quotaStateAtEnd: "HEALTHY",
  quotaRemainingAtEnd: 7_400,
  discoveryDatesRequested: [],
  fixtures: { received: 0, written: 0 },
  odds: {
    candidates: 0,
    requestsAttempted: 0,
    received: 0,
    written: 0,
    duplicates: 0,
  },
  lineups: {
    candidates: 0,
    requestsAttempted: 0,
    received: 0,
    written: 0,
    duplicates: 0,
    official: 0,
  },
  results: {
    candidates: 0,
    requestsAttempted: 0,
    received: 0,
    written: 0,
    duplicates: 0,
    settlementsWritten: 0,
  },
  skippedByReason: {},
  errorsByReason: {},
  startedAt: "2026-09-03T10:00:00.000Z",
  finishedAt: "2026-09-03T10:00:01.000Z",
};

describe("live provider-ingestion admin view", () => {
  it("labels a completed zero-call scheduler wake-up as healthy idle", () => {
    const html = renderToStaticMarkup(
      createElement(ProviderIngestionRunView, { run: baseRun }),
    );

    expect(html).toContain("Healthy idle");
    expect(html).toContain("Provider calls");
    expect(html).toContain(">0<");
    expect(html).toContain("No provider work was due");
  });

  it("shows result attempts, writes, skips, and errors for diagnosis", () => {
    const html = renderToStaticMarkup(
      createElement(ProviderIngestionRunView, {
        run: {
          ...baseRun,
          runHealth: "COMPLETED_WITH_ERRORS",
          resultOutcome: "FAILED",
          providerCallsUsed: 1,
          results: {
            candidates: 2,
            requestsAttempted: 1,
            received: 0,
            written: 0,
            duplicates: 0,
            settlementsWritten: 0,
          },
          skippedByReason: { RESULT_BATCH_CEILING: 1 },
          errorsByReason: { RESULT_RATE_LIMITED: 1 },
        },
      }),
    );

    expect(html).toContain("Completed with errors");
    expect(html).toContain("Result outcome");
    expect(html).toContain("Failed");
    expect(html).toContain("RESULT_BATCH_CEILING");
    expect(html).toContain("RESULT_RATE_LIMITED");
    expect(html).toContain("Attempts");
    expect(html).toContain("Settlements");
  });
});
