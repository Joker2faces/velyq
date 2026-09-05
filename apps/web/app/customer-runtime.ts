import {
  MappedCustomerQueryService,
  type CustomerReadResult,
} from "@velyq/application";
import type { CustomerMatchDto, CustomerTodayDto } from "@velyq/contracts";
import type { CustomerRawMatch, CustomerRawToday } from "@velyq/database";
import {
  customerDatabaseMapper,
  databaseCustomerQueries,
} from "./customer-database";
import { customerToday } from "./customer-data";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { customerFixtureMode, requireCustomerSession } from "./api/auth";

type CustomerService = {
  getToday: (asOf: Date) => Promise<
    | {
        ok: true;
        value: CustomerTodayDto;
      }
    | { ok: false; code: "NOT_FOUND" | "UNAVAILABLE"; messageKey: string }
  >;
  getMatch: (
    eventId: string,
    asOf: Date,
  ) => Promise<
    | {
        ok: true;
        value: CustomerMatchDto;
      }
    | { ok: false; code: "NOT_FOUND" | "UNAVAILABLE"; messageKey: string }
  >;
};

const fixtureService: CustomerService = {
  getToday(asOf: Date) {
    return new MappedCustomerQueryService<
      CustomerTodayDto,
      CustomerTodayDto,
      CustomerMatchDto,
      CustomerMatchDto
    >(
      {
        async getToday() {
          return customerToday;
        },
        async getMatch() {
          return null;
        },
      },
      { mapToday: (raw) => raw, mapMatch: () => customerToday.matches[0]! },
    ).getToday(asOf);
  },
  getMatch(eventId: string, asOf: Date) {
    return new MappedCustomerQueryService<
      CustomerTodayDto,
      CustomerTodayDto,
      CustomerMatchDto,
      CustomerMatchDto
    >(
      {
        async getToday() {
          return customerToday;
        },
        async getMatch() {
          return (
            customerToday.matches.find((match) => match.eventId === eventId) ??
            null
          );
        },
      },
      { mapToday: () => customerToday, mapMatch: (raw) => raw },
    ).getMatch(eventId, asOf);
  },
};
/* The two application services keep today and match DTO types distinct. */
function databaseService(
  database: NonNullable<ReturnType<typeof databaseCustomerQueries>>,
): CustomerService {
  const today = new MappedCustomerQueryService<
    CustomerRawToday,
    CustomerTodayDto,
    CustomerRawMatch,
    CustomerMatchDto
  >(database, customerDatabaseMapper);
  const match = new MappedCustomerQueryService<
    CustomerRawToday,
    CustomerTodayDto,
    CustomerRawMatch,
    CustomerMatchDto
  >(database, customerDatabaseMapper);
  return {
    getToday: (asOf: Date) => today.getToday(asOf),
    getMatch: (eventId: string, asOf: Date) => match.getMatch(eventId, asOf),
  };
}

export function customerService() {
  const database = databaseCustomerQueries();
  if (database) {
    return databaseService(database);
  }
  return customerFixtureMode() ? fixtureService : null;
}

export async function loadCustomerToday() {
  await requireCustomerPageAccess();
  const service = customerService();
  if (!service) return unavailable() as CustomerReadResult<CustomerTodayDto>;
  return service.getToday(new Date());
}

export async function loadCustomerMatch(eventId: string) {
  await requireCustomerPageAccess();
  const service = customerService();
  if (!service) return unavailable() as CustomerReadResult<CustomerMatchDto>;
  return service.getMatch(eventId, new Date());
}

async function requireCustomerPageAccess() {
  if (!process.env["VELYQ_DATABASE_URL"] && customerFixtureMode()) return;
  const cookieHeader = (await cookies()).toString();
  const request = new Request("https://velyq.local/customer", {
    headers: { cookie: cookieHeader },
  });
  const denied = await requireCustomerSession(request);
  if (denied) redirect("/sign-in");
}

export function unavailable(requestId: string = crypto.randomUUID()) {
  return {
    ok: false as const,
    code: "UNAVAILABLE" as const,
    messageKey: "customerUnavailable",
    type: "https://velyq.dev/problems/customer-unavailable",
    title: "Customer data is temporarily unavailable",
    status: 503 as const,
    requestId,
  };
}

export async function customerOddsHistory(
  eventId: string,
  outcomeId: string | null,
  asOf: Date,
) {
  const database = databaseCustomerQueries();
  if (database) {
    if (!outcomeId) return { ambiguous: true as const };
    try {
      return await database.getOddsHistory(eventId, outcomeId, asOf);
    } catch {
      return { unavailable: true as const };
    }
  }
  return null;
}
