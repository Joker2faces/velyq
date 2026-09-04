import { NextResponse } from "next/server";
import { requireCustomerSession } from "../../../../auth";
import { customerService, unavailable } from "../../../../../customer-runtime";

export async function GET(
  _request: Request,
  context: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await context.params;
  const denied = await requireCustomerSession(_request);
  if (denied) return denied;
  if (!isUuid(eventId)) return invalidEventId();
  const service = customerService();
  if (!service) return problem(unavailable());
  const result = await service.getMatch(eventId, new Date());
  if (!result.ok && result.code === "NOT_FOUND") return notFound();
  return result.ok
    ? NextResponse.json(result.value)
    : problem({ ...unavailable(), requestId: crypto.randomUUID() });
}

function problem(body: Readonly<Record<string, unknown>>) {
  return NextResponse.json(body, {
    status: Number(body["status"] ?? 503),
    headers: {
      "content-type": "application/problem+json",
      "x-request-id": String(body["requestId"]),
    },
  });
}

function notFound() {
  return problem({
    type: "https://velyq.dev/problems/not-found",
    title: "Event not found",
    status: 404,
    code: "EVENT_NOT_FOUND",
    requestId: crypto.randomUUID(),
  });
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function invalidEventId() {
  return problem({
    type: "https://velyq.dev/problems/invalid-request",
    title: "Invalid event ID",
    status: 400,
    code: "INVALID_EVENT_ID",
    requestId: crypto.randomUUID(),
  });
}
