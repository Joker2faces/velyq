import { MappedCustomerQueryService } from "@velyq/application";
import type { CustomerMatchDto, CustomerTodayDto } from "@velyq/contracts";
import type { CustomerRawMatch, CustomerRawToday } from "@velyq/database";
import {
  customerDatabaseMapper,
  databaseCustomerQueries,
} from "./customer-database";
import { customerToday } from "./customer-data";

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
  return process.env["VELYQ_SYNTHETIC_PREVIEW"] === "true" ||
    process.env["NODE_ENV"] !== "production"
    ? fixtureService
    : null;
}

export async function loadCustomerToday() {
  const service = customerService();
  if (!service) return null;
  const result = await service.getToday(new Date());
  return result.ok ? result.value : null;
}

export async function loadCustomerMatch(eventId: string) {
  const service = customerService();
  if (!service) return null;
  const result = await service.getMatch(eventId, new Date());
  return result.ok ? result.value : null;
}

export function unavailable() {
  return {
    ok: false as const,
    code: "UNAVAILABLE" as const,
    messageKey: "customerUnavailable",
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
