import { ZodError } from "zod";
import { describe, expect, it } from "vitest";

import {
  parseAdminServerEnvironment,
  parseMigrationEnvironment,
  parsePublicEnvironment,
  parseTestEnvironment,
  parseWebServerEnvironment,
  parseWorkerEnvironment,
} from "../src/index.js";

const publicEnvironment = {
  NEXT_PUBLIC_SUPABASE_URL: "https://synthetic.example.test",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "synthetic-publishable-key",
};

const serverEnvironment = {
  ...publicEnvironment,
  VELYQ_DATABASE_URL: "postgresql://velyq:local@db.example.test:5432/velyq",
  VELYQ_APPLICATION_ORIGIN: "https://app.example.test",
};

describe("public environment parsing", () => {
  it.each([
    ["null", null],
    ["array", []],
    ["non-string defined value", { NEXT_PUBLIC_SUPABASE_URL: 42 }],
    ["primitive", "not-an-environment-record"],
  ])("rejects %s with a typed configuration error", (_name, environment) => {
    expect(() => parsePublicEnvironment(environment)).toThrow(ZodError);
  });

  it("rejects a server secret presented in the public environment", () => {
    expect(() =>
      parsePublicEnvironment({
        NEXT_PUBLIC_SUPABASE_URL: "https://synthetic.example.test",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "synthetic-publishable-key",
        SUPABASE_SERVICE_ROLE_KEY: "must-not-be-public",
      }),
    ).toThrow(/not allowed/i);
  });

  it("accepts only the documented public Supabase values", () => {
    expect(
      parsePublicEnvironment({
        ...publicEnvironment,
        NEXT_PUBLIC_VELYQ_ADMIN_URL: "https://admin.example.test",
      }),
    ).toEqual({
      ...publicEnvironment,
      NEXT_PUBLIC_VELYQ_ADMIN_URL: "https://admin.example.test",
    });
  });
});

describe.each([
  ["web", parseWebServerEnvironment, "velyq-web"],
  ["admin", parseAdminServerEnvironment, "velyq-admin"],
] as const)("%s server environment parsing", (_name, parse, serviceName) => {
  it("requires pooled database, Supabase, and application origin values", () => {
    expect(() => parse(publicEnvironment)).toThrow(/VELYQ_DATABASE_URL/i);
    expect(() =>
      parse({ ...serverEnvironment, VELYQ_APPLICATION_ORIGIN: "file:///tmp" }),
    ).toThrow(/VELYQ_APPLICATION_ORIGIN/i);
  });

  it("returns typed observability defaults and optional server credentials", () => {
    expect(
      parse({
        ...serverEnvironment,
        SUPABASE_SERVICE_ROLE_KEY: "server-only-role-key",
        VELYQ_LOG_LEVEL: "warn",
        VELYQ_OTEL_ENDPOINT: "https://otel.example.test/v1/traces",
      }),
    ).toEqual({
      ...serverEnvironment,
      SUPABASE_SERVICE_ROLE_KEY: "server-only-role-key",
      VELYQ_LOG_LEVEL: "warn",
      VELYQ_OTEL_ENDPOINT: "https://otel.example.test/v1/traces",
      VELYQ_SERVICE_NAME: serviceName,
    });
  });

  it("rejects non-HTTP origins and non-PostgreSQL database URLs", () => {
    expect(() =>
      parse({ ...serverEnvironment, VELYQ_APPLICATION_ORIGIN: "ftp://host" }),
    ).toThrow(/VELYQ_APPLICATION_ORIGIN/i);
    expect(() =>
      parse({ ...serverEnvironment, VELYQ_DATABASE_URL: "https://database" }),
    ).toThrow(/VELYQ_DATABASE_URL/i);
  });
});

describe("migration environment parsing", () => {
  it("requires an explicit direct database URL", () => {
    expect(() => parseMigrationEnvironment(serverEnvironment)).toThrow(
      /VELYQ_DATABASE_DIRECT_URL/i,
    );
    expect(
      parseMigrationEnvironment({
        VELYQ_DATABASE_DIRECT_URL:
          "postgresql://velyq:local@db.example.test:5432/velyq",
      }),
    ).toEqual({
      VELYQ_DATABASE_DIRECT_URL:
        "postgresql://velyq:local@db.example.test:5432/velyq",
    });
  });
});

describe("worker environment parsing", () => {
  it("accepts unknown inputs at the boundary and rejects malformed records", () => {
    expect(() => parseWorkerEnvironment(null)).toThrow(ZodError);
  });

  it("rejects a worker configuration without its server-only database URL", () => {
    expect(() =>
      parseWorkerEnvironment({
        VELYQ_PROVIDER_MODE: "synthetic",
      }),
    ).toThrow(/VELYQ_DATABASE_URL/i);
  });

  it("parses queue and lease settings without requiring provider secrets", () => {
    expect(
      parseWorkerEnvironment({
        VELYQ_DATABASE_URL:
          "postgresql://velyq:local@db.example.test:5432/velyq",
        VELYQ_PROVIDER_MODE: "synthetic",
        VELYQ_LEASE_DURATION_MS: "45000",
      }),
    ).toEqual({
      VELYQ_DATABASE_URL: "postgresql://velyq:local@db.example.test:5432/velyq",
      VELYQ_PROVIDER_MODE: "synthetic",
      VELYQ_QUEUE_NAME: "velyq-synthetic",
      VELYQ_LEASE_DURATION_MS: 45000,
      VELYQ_WORKER_ID: "velyq-worker",
    });
  });

  it("rejects non-synthetic mode and invalid lease durations", () => {
    const environment = {
      VELYQ_DATABASE_URL: "postgresql://velyq:local@db.example.test:5432/velyq",
    };
    expect(() =>
      parseWorkerEnvironment({ ...environment, VELYQ_PROVIDER_MODE: "live" }),
    ).toThrow(/VELYQ_PROVIDER_MODE/i);
    expect(() =>
      parseWorkerEnvironment({ ...environment, VELYQ_LEASE_DURATION_MS: "0" }),
    ).toThrow(/VELYQ_LEASE_DURATION_MS/i);
  });
});

describe("test environment parsing", () => {
  const localEnvironment = {
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "local-test-key",
    VELYQ_DATABASE_URL:
      "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    VELYQ_FIXED_CLOCK: "2026-09-03T11:00:00.000Z",
  };

  it("accepts isolated local values and a fixed clock", () => {
    expect(parseTestEnvironment(localEnvironment)).toEqual(localEnvironment);
  });

  it("rejects non-local service endpoints and malformed clocks", () => {
    expect(() =>
      parseTestEnvironment({
        ...localEnvironment,
        NEXT_PUBLIC_SUPABASE_URL:
          "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
      }),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_URL/i);
    expect(() =>
      parseTestEnvironment({
        ...localEnvironment,
        VELYQ_DATABASE_URL:
          "postgresql://velyq:secret@production.example.com:5432/velyq",
      }),
    ).toThrow(/VELYQ_DATABASE_URL/i);
    expect(() =>
      parseTestEnvironment({
        ...localEnvironment,
        VELYQ_FIXED_CLOCK: "now",
      }),
    ).toThrow(/VELYQ_FIXED_CLOCK/i);
  });
});
