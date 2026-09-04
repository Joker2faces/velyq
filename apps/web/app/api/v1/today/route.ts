import { NextResponse } from "next/server";
import { requireCustomerSession } from "../../auth";
import { customerService, unavailable } from "../../../customer-runtime";
export async function GET(request: Request) {
  const denied = await requireCustomerSession(request);
  if (denied) return denied;
  const service = customerService();
  if (!service) return NextResponse.json(unavailable(), { status: 503 });
  const result = await service.getToday(new Date());
  return result.ok
    ? NextResponse.json(result.value)
    : NextResponse.json(result, { status: 503 });
}
