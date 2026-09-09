import { NextResponse } from "next/server";
import {
  configuredDataMode,
  resolveCustomerDataSource,
  syntheticDataAllowed,
} from "../../data-mode";
import { openRuntimeDatabaseSession } from "../../runtime-database/runtime-database";

/**
 * Liveness, plus an honest account of which customer data source a request
 * would actually resolve to.
 *
 * This endpoint used to translate the configured mode string into a label
 * and stop there, so it reported `intelligenceMode: "LIVE"`,
 * `syntheticOnly: false` on a Worker that answered every authenticated page
 * from the synthetic fixture. The label was not wrong about the string --
 * the defect was that nothing tied the string to the code path a request
 * took, so configuration and reality could disagree silently and did.
 *
 * Two things make the report trustworthy now:
 *
 *   1. `customerDataSource` is resolved through the same
 *      `resolveCustomerDataSource` that `customerService()` itself calls,
 *      against a real connection probe. It is a statement about the path a
 *      customer request would take, not about a string.
 *   2. `syntheticFallbackAllowed` comes from the same `app/data-mode`
 *      module. In LIVE it is false, and that is now a reachability claim:
 *      no database fault, preview flag or missing platform variable leads
 *      back into the fixture.
 *
 * The status stays 200 whenever the process is serving: this is liveness,
 * and a briefly unreachable dependency must not be reported as a dead
 * worker. An unavailable customer source is carried in the body, and
 * `/api/ready` remains the readiness gate. Nothing here exposes a
 * credential -- the probe reports only whether a connection was acquired,
 * and both mode variables are public by design.
 */
export async function GET() {
  const configuredMode = configuredDataMode();
  const syntheticFallbackAllowed = syntheticDataAllowed();

  /*
   * A demo deployment answers from the fixture and never reads the
   * database, so probing it there would surface an irrelevant failure as
   * though it affected customer reads.
   */
  let databaseAvailable: boolean | null = null;
  if (configuredMode === "LIVE") {
    const session = await openRuntimeDatabaseSession({
      connectionTimeoutMillis: 3000,
    });
    databaseAvailable = session !== null;
    if (session) await session.close().catch(() => {});
  }

  return NextResponse.json(
    {
      status: "ok",
      service: "velyq-customer",
      environment:
        process.env["VERCEL_ENV"] ?? process.env["NODE_ENV"] ?? "unknown",
      configuredDataMode: configuredMode,
      effectiveCustomerDataMode: configuredMode,
      customerDataSource: resolveCustomerDataSource(
        configuredMode,
        databaseAvailable === true,
      ),
      syntheticFallbackAllowed,
      databaseAvailable,
      /* Retained for existing consumers of the older field names. */
      intelligenceMode: configuredMode,
      syntheticOnly: configuredMode === "SYNTHETIC_DEMO",
    },
    { headers: { "cache-control": "no-store" } },
  );
}
