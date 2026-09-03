import { z } from "zod";

type Environment = Record<string, string | undefined>;

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
  environment: Environment,
): PublicEnvironment {
  const unexpectedKeys = Object.keys(environment).filter(
    (key) =>
      environment[key] !== undefined &&
      !publicKeys.includes(key as (typeof publicKeys)[number]),
  );

  if (unexpectedKeys.length > 0) {
    throw new Error(
      `Public environment contains variables that are not allowed: ${unexpectedKeys.join(", ")}`,
    );
  }

  return publicEnvironmentSchema.parse(environment);
}

export function parseWorkerEnvironment(
  environment: Environment,
): WorkerEnvironment {
  return workerEnvironmentSchema.parse(environment);
}

export { publicKeys };
