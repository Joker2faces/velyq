import { NextResponse } from "next/server";
import { createPrivilegedDatabaseClient } from "@velyq/database";
export async function GET() {
  const configured = Boolean(
    process.env["NEXT_PUBLIC_SUPABASE_URL"] &&
    process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] &&
    process.env["VELYQ_DATABASE_URL"],
  );
  if (!configured)
    return NextResponse.json(
      { status: "degraded", service: "velyq-admin", authConfigured: false },
      { status: 503 },
    );
  const client = createPrivilegedDatabaseClient({
    connectionString: process.env["VELYQ_DATABASE_URL"]!,
    connectionTimeoutMillis: 3000,
  });
  try {
    await client.pool.query("select 1");
    const auth = await fetch(
      `${process.env["NEXT_PUBLIC_SUPABASE_URL"]}/auth/v1/settings`,
      {
        headers: {
          apikey: process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]!,
        },
        cache: "no-store",
      },
    );
    if (!auth.ok) throw new Error("AUTH_UNAVAILABLE");
    return NextResponse.json({
      status: "ready",
      service: "velyq-admin",
      authConfigured: true,
    });
  } catch {
    return NextResponse.json(
      { status: "degraded", service: "velyq-admin", authConfigured: true },
      { status: 503 },
    );
  } finally {
    await client.close();
  }
}
