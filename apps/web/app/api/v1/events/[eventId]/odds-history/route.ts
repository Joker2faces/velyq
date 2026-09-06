import { NextResponse } from "next/server";
import { requireCustomerSession } from "../../../../auth";
import {
  customerOddsHistory,
  customerService,
  unavailable,
} from "../../../../../customer-runtime";

export async function GET(
  _request: Request,
  context: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await context.params;
  const denied = await requireCustomerSession(_request, "radar.full");
  if (denied) return denied;
  if (!isUuid(eventId)) return invalidEventId();
  const outcomeId = new URL(_request.url).searchParams.get("outcomeId");
  const history = await customerOddsHistory(eventId, outcomeId, new Date());
  if (history && "unavailable" in history) {
    return problem(unavailable());
  }
  if (history && "ambiguous" in history) {
    return problem({
      type: "https://velyq.dev/problems/invalid-request",
      title: "Outcome ID is required",
      status: 400,
      code: "OUTCOME_ID_REQUIRED",
      requestId: crypto.randomUUID(),
    });
  }
  if (history) {
    return NextResponse.json({
      eventId,
      syntheticLabel: "Synthetic data",
      observations: history.observations.map((observation) => ({
        observedAt: observation.providerObservedAt,
        odds: observation.decimalOdds,
      })),
    });
  }
  const service = await customerService();
  if (!service) return problem(unavailable());
  try {
    const result = await service.getMatch(eventId, new Date());
    if (!result.ok && result.code === "NOT_FOUND") return notFound();
    if (!result.ok) return problem(unavailable());
    const match = result.value;
    if (process.env["VELYQ_DATABASE_URL"]) {
      return NextResponse.json({
        eventId,
        syntheticLabel: match.syntheticLabel,
        observations: [],
      });
    }
    return NextResponse.json({
      eventId,
      syntheticLabel: match.syntheticLabel,
      observations: [
        { observedAt: "2026-09-04T08:00:00.000Z", odds: match.openingOdds },
        { observedAt: "2026-09-04T10:00:00.000Z", odds: match.currentOdds },
      ],
    });
  } finally {
    await service.close();
  }
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

function problem(body: Readonly<Record<string, unknown>>) {
  return NextResponse.json(body, {
    status: Number(body["status"] ?? 503),
    headers: {
      "content-type": "application/problem+json",
      "x-request-id": String(body["requestId"]),
    },
  });
}
