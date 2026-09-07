import { NextResponse } from "next/server";
import { customerFixtureMode } from "../auth";

/**
 * `syntheticOnly` used to be a hardcoded `true` — stale Phase-1 copy that
 * never reflected whether this deployment was actually reading the real
 * customer database. In production (`NODE_ENV=production`, no
 * `VELYQ_SYNTHETIC_PREVIEW` override) it is always false: the real
 * database-backed customer service has been the only one this deployment can
 * reach since before this fix, but the health check was still asserting the
 * opposite to anything monitoring it.
 */
export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "velyq-customer",
    environment:
      process.env["VERCEL_ENV"] ?? process.env["NODE_ENV"] ?? "unknown",
    syntheticOnly: customerFixtureMode(),
  });
}
