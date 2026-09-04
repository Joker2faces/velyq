import { NextResponse } from "next/server";
import { findCustomerMatch } from "../../../../../customer-data";

export async function GET(
  _request: Request,
  context: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await context.params;
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
  return NextResponse.json(match);
}
