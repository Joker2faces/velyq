import { NextResponse } from "next/server";
import { requireCustomerSession } from "../../auth";
import { customerService, unavailable } from "../../../customer-runtime";
export async function GET(request: Request) {
  const denied = await requireCustomerSession(request);
  if (denied) return denied;
  const service = customerService();
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  if (!service)
    return NextResponse.json(unavailable(requestId), {
      status: 503,
      headers: {
        "content-type": "application/problem+json",
        "x-request-id": requestId,
      },
    });
  const result = await service.getToday(new Date());
  return result.ok
    ? NextResponse.json(result.value)
    : NextResponse.json(
        {
          ...result,
          type: "https://velyq.dev/problems/customer-unavailable",
          title: "Customer data is temporarily unavailable",
          status: 503,
          requestId,
        },
        {
          status: 503,
          headers: {
            "content-type": "application/problem+json",
            "x-request-id": requestId,
          },
        },
      );
}
