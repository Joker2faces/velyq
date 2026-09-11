import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { translator } from "@velyq/ui";

import type { AdminProviderIngestionRunDto } from "../app/admin-api.js";
import {
  ProviderIngestionHealthStatus,
  ProviderIngestionPagination,
  ProviderIngestionRunView,
} from "../app/provider-ingestion-run-view.js";

const english = translator("en");
const greek = translator("el");

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
      createElement(ProviderIngestionRunView, { run: baseRun, t: english }),
    );

    expect(html).toContain("Healthy idle");
    expect(html).toContain("Provider calls");
    expect(html).toContain(">0<");
    expect(html).toContain("No provider work was due");
  });

  it("does not call a zero-call run idle when due work was quota blocked", () => {
    const html = renderToStaticMarkup(
      createElement(ProviderIngestionRunView, {
        run: {
          ...baseRun,
          runHealth: "QUOTA_BLOCKED",
          odds: { ...baseRun.odds, candidates: 2 },
          skippedByReason: { ODDS_QUOTA_EXHAUSTED: 1 },
        },
        t: english,
      }),
    );

    expect(html).toContain("Quota blocked");
    expect(html).toContain("ODDS_QUOTA_EXHAUSTED");
    expect(html).not.toContain("No provider work was due");
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
        t: english,
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

  it("renders Greek operator copy and an error-toned health chip", () => {
    const html = renderToStaticMarkup(
      createElement(ProviderIngestionHealthStatus, {
        runHealth: "COMPLETED_WITH_ERRORS",
        t: greek,
      }),
    );

    expect(html).toContain("Ολοκληρώθηκε με σφάλματα");
    expect(html).toContain("ops-status--failed");
    expect(html).not.toContain("COMPLETED_WITH_ERRORS");
  });

  it("renders translated newest and older keyset controls", () => {
    const html = renderToStaticMarkup(
      createElement(ProviderIngestionPagination, {
        cursor: "2026-09-03T10:00:00.000Z|00000000-0000-4000-8000-000000000005",
        nextCursor:
          "2026-09-02T10:00:00.000Z|00000000-0000-4000-8000-000000000006",
        t: greek,
      }),
    );

    expect(html).toContain("Νεότερες εκτελέσεις");
    expect(html).toContain("Παλαιότερες εκτελέσεις");
    expect(html).toContain("cursor=2026-09-02T10%3A00%3A00.000Z%7C");
  });
});
