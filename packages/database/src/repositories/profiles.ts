import type { PrivilegedVelyqDatabase } from "../client.js";
import { profiles } from "../schema/public.js";

export type Profile = typeof profiles.$inferSelect;

export type CreateProfileInput = Readonly<{
  userId: string;
  displayName?: string | null;
  locale?: string;
  timezone?: string;
}>;

export async function createProfileWithPrivilegedConnection(
  database: PrivilegedVelyqDatabase,
  input: CreateProfileInput,
): Promise<Profile> {
  const [profile] = await database
    .insert(profiles)
    .values({
      userId: input.userId,
      ...(input.displayName === undefined
        ? {}
        : { displayName: input.displayName }),
      ...(input.locale === undefined ? {} : { locale: input.locale }),
      ...(input.timezone === undefined ? {} : { timezone: input.timezone }),
    })
    .returning();

  if (!profile) {
    throw new Error("Privileged profile creation returned no row");
  }

  return profile;
}
