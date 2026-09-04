import { NextResponse } from "next/server";
import { requireCustomerSession } from "../../auth";
import { customerQueries } from "../../../customer-data";
export async function GET(request: Request) {
  const denied = await requireCustomerSession(request);
  if (denied) return denied;
  return NextResponse.json(await customerQueries.getToday());
}
