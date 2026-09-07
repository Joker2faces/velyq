import { NextResponse } from "next/server";
import { createPrivilegedDatabaseClient } from "@velyq/database/client";
import { runPreEventPredictionCycle } from "@velyq/worker-prediction";

import { authorizedScheduledRequest } from "../../scheduled-auth";

/**
 * The scheduled prediction cycle.
 *
 * Deliberately in the admin application rather than the customer one. The
 * customer app is served from Cloudflare Workers on the free plan, whose
 * budget is about ten milliseconds of CPU per invocation; a cycle that reads
 * every upcoming event, runs model inference per market and drains a job queue
 * is orders of magnitude past that. Running it there would trade the whole
 * static-hosting architecture for one background task.
 *
 * Equally deliberately not reachable from a page load of any kind. A
 * prediction created by a visitor would carry a forecast timestamp decided by
 * when somebody happened to browse, which makes the forecast ledger
 * meaningless, and it would let traffic decide how much provider quota and
 * database work the pipeline spends.
 *
 * The cycle itself is idempotent — its feature cutoff comes from the newest
 * observation in each decision's own input set — so a scheduler that fires
 * twice, or a retry after a timeout, adds nothing rather than duplicating
 * every prediction.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!authorizedScheduledRequest(request))
    return NextResponse.json({ code: "UNAUTHORIZED" }, { status: 401 });

  const connectionString = process.env["VELYQ_DATABASE_URL"];
  if (!connectionString)
    return NextResponse.json(
      { code: "DATABASE_NOT_CONFIGURED" },
      { status: 503 },
    );

  const client = createPrivilegedDatabaseClient({ connectionString, max: 1 });
  try {
    const cycle = await runPreEventPredictionCycle({
      database: client.database,
      asOf: new Date(),
      triggerSource: "SCHEDULED",
    });
    /*
     * The funnel counts are the response body, not just a side effect: a
     * scheduler's log is often the only place anybody looks, and "ran
     * successfully" without the counts cannot distinguish a cycle that
     * evaluated six markets from one that found no model registered.
     */
    return NextResponse.json(
      {
        asOf: cycle.asOf,
        horizonHours: cycle.horizonHours,
        modelVersion: cycle.modelVersion,
        modelMaturity: cycle.modelMaturity,
        counts: cycle.counts,
        noBetReasons: cycle.noBetReasons,
        drained: cycle.drained,
        funnelRunId: cycle.funnelRunId,
      },
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    console.error("scheduled-prediction-cycle", {
      code: error instanceof Error ? error.message : "PREDICTION_CYCLE_FAILED",
    });
    return NextResponse.json(
      { code: "PREDICTION_CYCLE_FAILED" },
      { status: 503, headers: { "cache-control": "private, no-store" } },
    );
  } finally {
    await client.close();
  }
}
