import { createDatabaseAdminRuntime } from "./database-admin";
import { cookies, headers } from "next/headers";
import { hasPermission, type PermissionCode } from "@velyq/auth";

type HeaderStore = Readonly<{ get(name: string): string | null }>;
type CookieStore = Readonly<{ toString(): string }>;

export async function adminRequest(
  headerStore: HeaderStore,
  cookieStore: CookieStore,
) {
  const host = headerStore.get("host") ?? "localhost";
  return new Request(`https://${host}/`, {
    headers: { cookie: cookieStore.toString() },
  });
}

export async function getAdminContext(
  permission: PermissionCode = "admin.access",
) {
  const runtime = createDatabaseAdminRuntime();
  if (!runtime) return { runtime: null, authentication: null } as const;
  const authentication = await runtime.authenticator(
    await adminRequest(await headers(), await cookies()),
    crypto.randomUUID(),
  );
  if ("problem" in authentication) {
    await runtime.close();
    return { runtime: null, authentication } as const;
  }
  if (!hasPermission(authentication.principal, permission)) {
    await runtime.close();
    return { runtime: null, authentication } as const;
  }
  return { runtime, authentication } as const;
}

/*
 * `AdminShell` now lives in `admin-shell.tsx`, alongside the navigation model
 * and the gate states. It is re-exported here so the existing pages keep
 * their import path and none of their data logic had to be touched.
 */
export { AdminShell, AdminGate } from "./admin-shell";
