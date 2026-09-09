import { NextResponse } from "next/server";
import { createPrivilegedDatabaseClient } from "@velyq/database/client";
import { createProviderIngestionAdapter } from "@velyq/database/repositories/provider-ingestion-adapter";
import { runProviderIngestion } from "@velyq/application/provider-ingestion";

import { checkSchedulerAuth } from "../../../scheduler-auth";

/**
 * The scheduler-driven entry point for real provider ingestion.
 *
 * It lives in the admin application because that is where the provider
 * credential already is: `APISPORTS_KEY` is configured server-side on this
 * Vercel project, and the customer runtime -- a Cloudflare Worker on the free
 * plan, with a 10ms CPU allowance and a 50-subrequest ceiling -- could not
 * host this work even if the key were there.
 *
 * Supabase Cron calls this on a fixed cadence, but a wake-up is not a
 * decision to spend provider quota. `runProviderIngestion` decides that from
 * database state, and a call that finds nothing due makes zero provider
 * requests and returns 200 -- the normal outcome, not a failure.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/*
 * A run is bounded by the orchestrator's per-invocation odds ceiling rather
 * than by this limit, but the limit is declared explicitly so a slow provider
 * cannot leave the function to be killed at whatever the platform default
 * happens to be. The platform caps this to whatever the plan allows.
 */
export const maxDuration = 60;

/**
 * Guards against a slow run overlapping the next scheduled one within the
 * same warm instance. It is deliberately not presented as a distributed lock:
 * Vercel may run several instances, so the real protection against duplicate
 * work is that every write is idempotent -- fixtures keyed by provider
 * identity, odds deduplicated by content hash -- and that the quota state is
 * shared in the database rather than held in memory.
 */
let ingestionInFlight = false;

export async function POST(request: Request) {
  const auth = checkSchedulerAuth(request.headers);
  if (!auth.ok) {
    return NextResponse.json(
      { error: "Unauthorized" },
      {
        status: auth.reason === "SECRET_NOT_CONFIGURED" ? 503 : 401,
        headers: { "cache-control": "no-store" },
      },
    );
  }

  if (ingestionInFlight) {
    /*
     * 409 rather than 200: the scheduler should be able to tell "nothing was
     * due" from "the previous run had not finished", because a persistent
     * second case means the cadence is too tight.
     */
    return NextResponse.json(
      { code: "INGESTION_IN_PROGRESS" },
      { status: 409, headers: { "cache-control": "no-store" } },
    );
  }

  const connectionString = process.env["VELYQ_DATABASE_URL"];
  if (!connectionString) {
    return NextResponse.json(
      { error: "Database unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    trigger?: unknown;
  } | null;
  /* Anything but an explicit MANUAL is treated as the scheduler. */
  const trigger = body?.trigger === "MANUAL" ? "MANUAL" : "SCHEDULER";

  ingestionInFlight = true;
  const client = createPrivilegedDatabaseClient({
    connectionString,
    connectionTimeoutMillis: 10_000,
  });

  try {
    const adapter = await createProviderIngestionAdapter(client.database);
    const result = await runProviderIngestion(adapter.deps, { trigger });
    await adapter.recordRun(result);

    /*
     * The full run summary is returned, not just a status. Supabase Cron
     * keeps its own history of the response, so this is the record an
     * operator reads first when asking why Today is empty -- and it contains
     * no provider credential, no club names and no customer data.
     */
    return NextResponse.json(result, {
      status: 200,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    /*
     * Redacted before anything reaches a log or a response body. A connection
     * string or a provider key in an error message would be a credential
     * leak into Supabase Cron's run history, which is a far worse outcome
     * than an unexplained failure.
     */
    const message = String(error instanceof Error ? error.message : error)
      .replaceAll(/postgres(?:ql)?:\/\/\S+/gi, "[DATABASE_URL_REDACTED]")
      .replaceAll(/(password|token|key|secret)=\S+/gi, "$1=[REDACTED]");
    console.error("provider-ingest failed", { message });
    return NextResponse.json(
      { error: "Ingestion failed" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  } finally {
    ingestionInFlight = false;
    await client.close().catch(() => {});
  }
}
