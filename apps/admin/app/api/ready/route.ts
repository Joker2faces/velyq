import { NextResponse } from "next/server";
export function GET() {
  const configured = Boolean(
    process.env["NEXT_PUBLIC_SUPABASE_URL"] &&
    process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] &&
    process.env["VELYQ_DATABASE_URL"],
  );
  return NextResponse.json(
    {
      status: configured ? "ready" : "degraded",
      service: "velyq-admin",
      authConfigured: configured,
    },
    { status: configured ? 200 : 503 },
  );
}
