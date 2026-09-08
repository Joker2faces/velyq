import { NextResponse } from "next/server";
import { requireCustomerSession } from "../../auth";
import { buildDemoHistory } from "../../../customer/history-data";

/** Temporary demo read model; live history is enabled only after migration verification. */
export async function GET(request: Request) {
  const denied = await requireCustomerSession(request, "today.view");
  if (denied) return denied;
  const liveMode = process.env["VELYQ_DATA_MODE"] === "live";
  if (liveMode)
    return NextResponse.json(
      {
        syntheticLabel: "Live data",
        asOf: new Date().toISOString(),
        period:
          "Live history unavailable until settlement migration is verified",
        modelVersion: "unknown",
        decisions: [],
      },
      {
        headers: { "cache-control": "private, no-store" },
      },
    );
  return NextResponse.json(buildDemoHistory(new Date()), {
    headers: { "cache-control": "private, no-store" },
  });
}
