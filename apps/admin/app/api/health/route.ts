import { NextResponse } from "next/server";

/**
 * `syntheticOnly` used to be a hardcoded `true` — stale Phase-1 copy that
 * never reflected whether this deployment is running against real production
 * data or a local/preview fixture environment. Matches the same rule the
 * customer health route now uses: false in a real production runtime.
 *
 * This is a liveness flag about the runtime, not a claim about the database's
 * contents — historical synthetic seed rows remain in production
 * intentionally (see the admin console's own historical-data labelling) and
 * are unaffected by this.
 */
export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "velyq-admin",
    environment:
      process.env["VERCEL_ENV"] ?? process.env["NODE_ENV"] ?? "unknown",
    syntheticOnly: process.env["NODE_ENV"] !== "production",
  });
}
