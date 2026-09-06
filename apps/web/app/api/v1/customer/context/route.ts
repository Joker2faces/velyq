import { NextResponse } from "next/server";
import { requireCustomerSession } from "../../../auth";
import {
  resolveCustomerContext,
  unavailable,
} from "../../../../customer-runtime";

/**
 * Who the customer is and what they may see.
 *
 * The customer UI is served as static shells, so the browser cannot be told
 * any of this at render time — a static file is byte-identical for every
 * visitor. The shell asks here first and renders from the answer:
 *
 *   401  no session            → the shell sends them to sign-in
 *   403  session, no access    → the shell shows the locked state
 *   200  ready                 → the shell renders the customer's own view
 *
 * Everything returned is the customer's own, resolved server-side from their
 * session and their rows in the database. Nothing here is derived from
 * anything the browser sent beyond the session cookie itself.
 */
export async function GET(request: Request) {
  const denied = await requireCustomerSession(request);
  if (denied) return denied;

  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const context = await resolveCustomerContext(
    request.headers.get("cookie") ?? "",
  );
  if (!context)
    return NextResponse.json(unavailable(requestId), {
      status: 503,
      headers: {
        "content-type": "application/problem+json",
        "x-request-id": requestId,
      },
    });

  return NextResponse.json(context, {
    // Identity and entitlements: never shared between viewers, never stored.
    headers: { "cache-control": "private, no-store" },
  });
}
