import { NextResponse } from "next/server";
import { createPrivilegedDatabaseClient } from "@velyq/database/client";
import { createApiSportsClient } from "@velyq/providers/apisports";
import { syncApiSportsCoverage } from "@velyq/worker-ingestion";

import { authorizedScheduledRequest } from "../../scheduled-auth";

/**
 * The scheduled coverage sync.
 *
 * Reads the provider's own per-league coverage flags — which competitions it
 * publishes lineups, odds and statistics for — and stores them. This is the
 * only thing that can distinguish "no lineup has been published yet" from
 * "this league will never have one", and that distinction is what stops the
 * lineup poller spending its budget on competitions the provider does not
 * cover, and what stops FORTRESS being awarded on evidence that cannot exist.
 *
 * Its own schedule, and a slow one. Coverage changes when a season turns
 * over, not during a matchday, so one request a day is generous — and on a
 * hundred-request budget, a daily cost of one is what makes it affordable at
 * all.
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
    const result = await syncApiSportsCoverage({
      database: client.database,
      client: createApiSportsClient("football"),
      asOf: new Date(),
    });
    return NextResponse.json(result, {
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    console.error("scheduled-coverage-sync", {
      code: error instanceof Error ? error.message : "COVERAGE_SYNC_FAILED",
    });
    return NextResponse.json(
      { code: "COVERAGE_SYNC_FAILED" },
      { status: 503, headers: { "cache-control": "private, no-store" } },
    );
  } finally {
    await client.close();
  }
}
