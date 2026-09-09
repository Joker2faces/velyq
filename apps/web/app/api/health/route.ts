import { NextResponse } from "next/server";
export function GET() {
  const intelligenceMode =
    process.env["VELYQ_CUSTOMER_INTELLIGENCE_MODE"] === "SYNTHETIC_DEMO"
      ? "SYNTHETIC_DEMO"
      : "LIVE";
  return NextResponse.json({
    status: "ok",
    service: "velyq-customer",
    environment:
      process.env["VERCEL_ENV"] ?? process.env["NODE_ENV"] ?? "unknown",
    intelligenceMode,
    syntheticOnly: intelligenceMode === "SYNTHETIC_DEMO",
  });
}
