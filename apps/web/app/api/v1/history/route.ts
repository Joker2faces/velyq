import { NextResponse } from "next/server";
import { requireCustomerSession } from "../../auth";
import { buildDemoHistory } from "../../../customer/history-data";

/** Temporary demo read model; live history is enabled only after migration verification. */
export async function GET(request: Request) {
  const denied = await requireCustomerSession(request, "today.view");
  if (denied) return denied;
  return NextResponse.json(buildDemoHistory(new Date()), {
    headers: { "cache-control": "private, no-store" },
  });
}
