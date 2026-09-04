import { z } from "zod";

function isPlainEnvironmentRecord(
  value: unknown,
): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

const environmentRecordSchema = z
  .custom<Record<string, unknown>>(isPlainEnvironmentRecord, {
    error: "Environment input must be a plain record.",
  })
  .pipe(z.record(z.string(), z.string().optional()));

const httpUrlSchema = z.url().refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === "http:" || protocol === "https:";
}, "Expected an HTTP(S) URL.");

const postgresUrlSchema = z.url().refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === "postgres:" || protocol === "postgresql:";
}, "Expected a PostgreSQL URL.");

const localUrlSchema = z.url().refine((value) => {
  const hostname = new URL(value).hostname;
  return (
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]"
  );
}, "Expected a loopback-only URL.");

const fixedClockSchema = z
  .string()
  .refine(
    (value) =>
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
      Number.isFinite(Date.parse(value)),
    "Expected an ISO-8601 UTC timestamp.",
  );

const publicKeys = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_VELYQ_ADMIN_URL",
] as const;

const publicEnvironmentSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: httpUrlSchema,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_VELYQ_ADMIN_URL: httpUrlSchema.optional(),
});

const serverEnvironmentShape = {
  NEXT_PUBLIC_SUPABASE_URL: httpUrlSchema,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  VELYQ_DATABASE_URL: postgresUrlSchema,
  VELYQ_APPLICATION_ORIGIN: httpUrlSchema,
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  VELYQ_LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("info"),
  VELYQ_OTEL_ENDPOINT: httpUrlSchema.optional(),
};

const logLevelSchema = z.enum([
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
]);

function serverEnvironmentSchema(serviceName: "velyq-web" | "velyq-admin") {
  return z.object({
    ...serverEnvironmentShape,
    VELYQ_SERVICE_NAME: z.literal(serviceName).default(serviceName),
  });
}

const webServerEnvironmentSchema = serverEnvironmentSchema("velyq-web");
const adminServerEnvironmentSchema = serverEnvironmentSchema("velyq-admin");

const migrationEnvironmentSchema = z.object({
  VELYQ_DATABASE_DIRECT_URL: postgresUrlSchema,
});

const workerEnvironmentSchema = z.object({
  VELYQ_DATABASE_URL: postgresUrlSchema,
  VELYQ_PROVIDER_MODE: z.literal("synthetic").default("synthetic"),
  VELYQ_QUEUE_NAME: z.string().min(1).default("velyq-synthetic"),
  VELYQ_WORKER_ID: z.string().min(1).default("velyq-worker"),
  VELYQ_LEASE_DURATION_MS: z.coerce.number().int().positive().default(30_000),
  VELYQ_FIXED_CLOCK: fixedClockSchema.optional(),
  VELYQ_PROVIDER_ID: z.string().uuid().optional(),
  VELYQ_PROVIDER_POLICY_VERSION_ID: z.string().uuid().optional(),
  VELYQ_QUALITY_POLICY_VERSION_ID: z.string().uuid().optional(),
  VELYQ_FIXTURE_PATH: z.string().min(1).optional(),
  VELYQ_LOG_LEVEL: logLevelSchema.optional(),
  VELYQ_OTEL_ENDPOINT: httpUrlSchema.optional(),
});

const localPostgresUrlSchema = localUrlSchema.refine(
  (value) => ["postgres:", "postgresql:"].includes(new URL(value).protocol),
  "Expected a loopback-only PostgreSQL URL.",
);

const localHttpUrlSchema = localUrlSchema.refine(
  (value) => ["http:", "https:"].includes(new URL(value).protocol),
  "Expected a loopback-only HTTP(S) URL.",
);

const testEnvironmentSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: localHttpUrlSchema,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  VELYQ_DATABASE_URL: localPostgresUrlSchema,
  VELYQ_DATABASE_DIRECT_URL: localPostgresUrlSchema.optional(),
  VELYQ_FIXED_CLOCK: fixedClockSchema.optional(),
});

export type PublicEnvironment = z.infer<typeof publicEnvironmentSchema>;
export type WebServerEnvironment = z.infer<typeof webServerEnvironmentSchema>;
export type AdminServerEnvironment = z.infer<
  typeof adminServerEnvironmentSchema
>;
export type MigrationEnvironment = z.infer<typeof migrationEnvironmentSchema>;
export type WorkerEnvironment = z.infer<typeof workerEnvironmentSchema>;
export type TestEnvironment = z.infer<typeof testEnvironmentSchema>;

function parseEnvironmentRecord(environment: unknown) {
  return environmentRecordSchema.parse(environment);
}

export function parsePublicEnvironment(
  environment: unknown,
): PublicEnvironment {
  const parsedEnvironment = parseEnvironmentRecord(environment);
  const unexpectedKeys = Object.keys(parsedEnvironment).filter(
    (key) =>
      parsedEnvironment[key] !== undefined &&
      !publicKeys.includes(key as (typeof publicKeys)[number]),
  );

  if (unexpectedKeys.length > 0) {
    throw new Error(
      `Public environment contains variables that are not allowed: ${unexpectedKeys.join(", ")}`,
    );
  }

  return publicEnvironmentSchema.parse(parsedEnvironment);
}

export function parseWebServerEnvironment(
  environment: unknown,
): WebServerEnvironment {
  return webServerEnvironmentSchema.parse(parseEnvironmentRecord(environment));
}

export function parseAdminServerEnvironment(
  environment: unknown,
): AdminServerEnvironment {
  return adminServerEnvironmentSchema.parse(
    parseEnvironmentRecord(environment),
  );
}

export function parseMigrationEnvironment(
  environment: unknown,
): MigrationEnvironment {
  return migrationEnvironmentSchema.parse(parseEnvironmentRecord(environment));
}

export function parseWorkerEnvironment(
  environment: unknown,
): WorkerEnvironment {
  return workerEnvironmentSchema.parse(parseEnvironmentRecord(environment));
}

export function parseTestEnvironment(environment: unknown): TestEnvironment {
  return testEnvironmentSchema.parse(parseEnvironmentRecord(environment));
}

export { publicKeys };
