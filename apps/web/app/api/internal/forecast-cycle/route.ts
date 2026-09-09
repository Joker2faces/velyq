import { NextResponse } from "next/server";
import { runForecastCycle } from "@velyq/application/forecast-cycle";
import { createForecastCycleDbAdapter } from "@velyq/database/repositories/forecast-cycle-adapter";

import { openRuntimeDatabaseSession } from "../../../runtime-database/runtime-database";
import { checkForecastCycleAuth } from "../../../forecast-cycle/auth";
import { validateForecastCycleRequest } from "../../../forecast-cycle/request";
import { loadProductionModelArtifact } from "../../../forecast-cycle/model-artifact";

const PROVIDER_CODE = "API_SPORTS";

/**
 * Thin trigger for the real forecast pipeline: authenticate, validate the
 * request, wire the production database adapter and the committed model
 * artifact, call `runForecastCycle`, return its summary. No business logic
 * lives here -- everything that decides what a forecast is belongs in
 * `runForecastCycle` and the repositories it calls, not in this route.
 *
 * Exposed as both GET and POST against the same handler: Vercel Cron Jobs
 * invoke a scheduled path with GET only (see vercel.json), so GET always
 * runs the safe default window; POST additionally accepts a JSON body for
 * a manual/admin-triggered run with an explicit window.
 */
async function runTrigger(request: Request, body: unknown) {
  const auth = checkForecastCycleAuth(request.headers);
  if (!auth.ok) {
    // A missing server secret is an operator misconfiguration, not a
    // caller's fault -- 503, not 401, and still no detail beyond the
    // reason code (never the secret itself, never whether one is merely
    // wrong vs. absent, in the body: same status/shape either way keeps
    // that distinction out of the response, only structured logs get it).
    console.error("forecast-cycle trigger auth failed", {
      reason: auth.reason,
    });
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: auth.reason === "SECRET_NOT_CONFIGURED" ? 503 : 401 },
    );
  }

  const now = new Date();
  const validated = validateForecastCycleRequest(body, now);
  if (!validated.ok) {
    return NextResponse.json(
      { error: "Invalid request", reason: validated.reason },
      { status: 400 },
    );
  }

  let modelArtifact;
  try {
    modelArtifact = loadProductionModelArtifact();
  } catch (error) {
    console.error("forecast-cycle trigger model artifact invalid", {
      message: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    });
    return NextResponse.json(
      { error: "Model artifact unavailable" },
      { status: 503 },
    );
  }

  const session = await openRuntimeDatabaseSession();
  if (!session) {
    console.error("forecast-cycle trigger database unavailable");
    return NextResponse.json(
      { error: "Database unavailable" },
      { status: 503 },
    );
  }

  const runId = `forecast-cycle-trigger:${now.toISOString()}`;
  console.log("forecast-cycle run started", {
    runId,
    from: validated.value.from.toISOString(),
    to: validated.value.to.toISOString(),
    mode: validated.value.mode,
  });

  try {
    const adapter = await createForecastCycleDbAdapter(session.database, {
      modelArtifact,
      providerCode: PROVIDER_CODE,
      dataOrigin: validated.value.mode,
      /*
       * Deliberately no `triggerJobId`. `prediction_runs.trigger_job_id` is a
       * foreign key into `operations.jobs`, and this trigger is not a queued
       * job -- it is an HTTP call. Passing `runId` here made every insert
       * fail (first as invalid uuid syntax, then as a foreign-key violation),
       * so a live cycle scanned real fixtures, resolved every identity, and
       * persisted nothing. `runId` remains the correlation id in the logs
       * below, which is what it was always good for.
       */
    });
    const result = await runForecastCycle(adapter, {
      from: validated.value.from,
      to: validated.value.to,
    });

    console.log("forecast-cycle run completed", {
      runId: result.runId,
      durationMs: result.durationMs,
      fixturesScanned: result.fixturesScanned,
      predictionsCreated: result.predictionsCreated,
      strongEdgeCount: result.strongEdgeCount,
    });

    return NextResponse.json({
      runId: result.runId,
      startedAt: result.startedAt,
      finishedAt: result.finishedAt,
      durationMs: result.durationMs,
      fixturesScanned: result.fixturesScanned,
      identityResolved: result.identityResolved,
      modelEligible: result.modelEligible,
      predictionsCreated: result.predictionsCreated,
      forecastsCreated: result.forecastsCreated,
      decisionsCreated: result.decisionsCreated,
      strongEdgeCount: result.strongEdgeCount,
      noBetCount: result.noBetCount,
      waitCount: result.waitCount,
      waitForLineupCount: result.waitForLineupCount,
      insufficientCount: result.insufficientCount,
      skippedByReason: result.skippedByReason,
      errorsByReason: result.errorsByReason,
    });
  } catch (error) {
    // A fatal, whole-run failure (e.g. the database connection dropping
    // mid-cycle) is distinct from the per-fixture isolation
    // `runForecastCycle` already provides via `errorsByReason` -- this is
    // the operational catch-all for "the run itself never completed",
    // and it must never leak an internal stack trace to the response.
    console.error("forecast-cycle run failed", {
      runId,
      message: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    });
    return NextResponse.json(
      { error: "Forecast cycle failed", runId },
      { status: 500 },
    );
  } finally {
    await session.close().catch(() => {});
  }
}

/** Vercel Cron Jobs invoke with GET -- always the safe default window. */
export async function GET(request: Request) {
  return runTrigger(request, {});
}

/** Manual/admin invocation, with an explicit window and/or mode. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => undefined);
  return runTrigger(request, body);
}
