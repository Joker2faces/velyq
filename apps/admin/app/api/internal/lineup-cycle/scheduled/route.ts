import { NextResponse } from "next/server";
import { createPrivilegedDatabaseClient } from "@velyq/database/client";
import { createApiSportsClient } from "@velyq/providers/apisports";
import { runLineupCycle } from "@velyq/worker-ingestion";

import { authorizedScheduledRequest } from "../../scheduled-auth";

/**
 * The scheduled lineup poll.
 *
 * Its own endpoint and its own schedule, deliberately separate from odds
 * ingestion and from the prediction cycle. A starting eleven is published in
 * a narrow window before kickoff and not before; polling for it on the odds
 * cadence would spend most of a hundred-request daily budget asking about
 * fixtures a day out, and polling for it on the prediction cadence would
 * arrive after the decision that needed it.
 *
 * Nothing here decides anything. It stores what the provider published, with
 * its provenance, and lets the next prediction cycle read it — so a lineup
 * that arrives between two cycles is picked up by the later one rather than
 * triggering a decision at whatever moment the poll happened to succeed.
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
  if (!process.env["APISPORTS_KEY"])
    return NextResponse.json(
      { code: "PROVIDER_NOT_CONFIGURED" },
      { status: 503 },
    );

  const client = createPrivilegedDatabaseClient({ connectionString, max: 1 });
  try {
    const cycle = await runLineupCycle({
      database: client.database,
      client: createApiSportsClient("football"),
      asOf: new Date(),
    });
    /*
     * The plan is in the response, not just the outcome. "Requested zero"
     * is the normal answer for most of the day and it is indistinguishable
     * from a broken poll unless the reasons come with it.
     */
    return NextResponse.json(cycle, {
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    console.error("scheduled-lineup-cycle", {
      code: error instanceof Error ? error.message : "LINEUP_CYCLE_FAILED",
    });
    return NextResponse.json(
      { code: "LINEUP_CYCLE_FAILED" },
      { status: 503, headers: { "cache-control": "private, no-store" } },
    );
  } finally {
    await client.close();
  }
}
