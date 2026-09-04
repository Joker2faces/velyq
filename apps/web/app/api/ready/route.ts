import { NextResponse } from "next/server";
export function GET() {
  const configured = Boolean(
    process.env["NEXT_PUBLIC_SUPABASE_URL"] &&
    process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"],
  );
  return NextResponse.json(
    {
      status: configured ? "ready" : "degraded",
      service: "velyq-customer",
      authConfigured: configured,
    },
    { status: configured ? 200 : 503 },
  );
}
