import { NextResponse } from "next/server";
import { openRuntimeDatabaseSession } from "../../runtime-database/runtime-database";

/*
 * Readiness proves the database path the runtime actually selected, not one
 * particular way of configuring it. Reading `VELYQ_DATABASE_URL` directly made
 * every Cloudflare deployment report `degraded`, because there the connection
 * string arrives through the Hyperdrive binding and that variable is absent by
 * design. `select 1` runs over the resolved session, so a 200 is evidence that
 * the selected path — Node or Hyperdrive — reached PostgreSQL.
 *
 * `databaseConfigured` keeps its original meaning: a source resolved. Whether
 * that source actually answered is carried by the status, exactly as before.
 * `databaseSource` is additive, and says which path was proven.
 */
export async function GET() {
  const authUrl = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const authKey = process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
  const authConfigured = Boolean(authUrl && authKey);

  if (!authConfigured)
    return degraded({ authConfigured, databaseConfigured: false });

  const session = await openRuntimeDatabaseSession({
    connectionTimeoutMillis: 3000,
  });
  if (!session)
    return degraded({ authConfigured, databaseConfigured: false });

  const checks = {
    authConfigured,
    databaseConfigured: true,
    databaseSource: session.source,
  };

  try {
    await session.client.pool.query("select 1");
    const auth = await fetch(`${authUrl}/auth/v1/settings`, {
      headers: { apikey: authKey! },
      cache: "no-store",
    });
    if (!auth.ok) throw new Error("AUTH_UNAVAILABLE");
    return NextResponse.json({
      status: "ready",
      service: "velyq-customer",
      checks,
    });
  } catch {
    return degraded(checks);
  } finally {
    // A probe must never fail louder than the thing it is probing: releasing
    // the connection can itself throw, and that must not become a 500.
    await session.close().catch(() => {});
  }
}

function degraded(checks: Record<string, unknown>) {
  return NextResponse.json(
    { status: "degraded", service: "velyq-customer", checks },
    { status: 503 },
  );
}
