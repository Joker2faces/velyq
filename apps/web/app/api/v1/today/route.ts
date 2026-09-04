import { NextResponse } from "next/server";
import { requireCustomerSession } from "../../auth";
import { customerQueries } from "../../../customer-data";
import {
  customerDatabaseMapper,
  databaseCustomerQueries,
} from "../../../customer-database";
export async function GET(request: Request) {
  const denied = await requireCustomerSession(request);
  if (denied) return denied;
  const database = databaseCustomerQueries();
  if (database) {
    const result = await database.getToday(new Date());
    return NextResponse.json(customerDatabaseMapper.mapToday(result));
  }
  return NextResponse.json(await customerQueries.getToday());
}
