import { NextResponse } from "next/server";
import { customerToday } from "../../../customer-data";
export function GET() {
  return NextResponse.json(customerToday);
}
