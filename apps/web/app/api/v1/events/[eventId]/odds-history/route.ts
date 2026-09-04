import { NextResponse } from "next/server";
import { requireCustomerSession } from "../../../../auth";
import { findCustomerMatch } from "../../../../../customer-data";

export async function GET(
  _request: Request,
  context: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await context.params;
  const denied = await requireCustomerSession(_request);
  if (denied) return denied;
  const match = findCustomerMatch(eventId);
  if (!match)
    return NextResponse.json(
      {
        type: "https://velyq.dev/problems/not-found",
        title: "Event not found",
        status: 404,
        code: "EVENT_NOT_FOUND",
        requestId: crypto.randomUUID(),
      },
      { status: 404 },
    );
  return NextResponse.json({
    eventId,
    syntheticLabel: match.syntheticLabel,
    observations: [
      { observedAt: "2026-09-04T08:00:00.000Z", odds: match.openingOdds },
      { observedAt: "2026-09-04T10:00:00.000Z", odds: match.currentOdds },
    ],
  });
}
