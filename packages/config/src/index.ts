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

const publicKeys = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
] as const;

const publicEnvironmentSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
});

const workerEnvironmentSchema = z.object({
  VELYQ_DATABASE_URL: z.url(),
  VELYQ_PROVIDER_MODE: z.literal("synthetic"),
  VELYQ_QUEUE_NAME: z.string().min(1).default("velyq-synthetic"),
});

export type PublicEnvironment = z.infer<typeof publicEnvironmentSchema>;
export type WorkerEnvironment = z.infer<typeof workerEnvironmentSchema>;

export function parsePublicEnvironment(
  environment: unknown,
): PublicEnvironment {
  const parsedEnvironment = environmentRecordSchema.parse(environment);
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

export function parseWorkerEnvironment(
  environment: unknown,
): WorkerEnvironment {
  return workerEnvironmentSchema.parse(
    environmentRecordSchema.parse(environment),
  );
}

export { publicKeys };
