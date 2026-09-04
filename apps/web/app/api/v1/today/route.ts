import { NextResponse } from "next/server";
import { requireCustomerSession } from "../../auth";
import { customerToday } from "../../../customer-data";
export async function GET(request: Request) {
  const denied = await requireCustomerSession(request);
  if (denied) return denied;
  return NextResponse.json(customerToday);
}
