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
  if (!isUuid(eventId)) return invalidEventId();
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

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function invalidEventId() {
  return NextResponse.json(
    {
      type: "https://velyq.dev/problems/invalid-request",
      title: "Invalid event ID",
      status: 400,
      code: "INVALID_EVENT_ID",
      requestId: crypto.randomUUID(),
    },
    { status: 400 },
  );
}
