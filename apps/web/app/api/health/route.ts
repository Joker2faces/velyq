import { NextResponse } from "next/server";
export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "velyq-customer",
    environment:
      process.env["VERCEL_ENV"] ?? process.env["NODE_ENV"] ?? "unknown",
    syntheticOnly: true,
  });
}
