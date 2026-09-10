import { createDatabaseAdminRuntime } from "./database-admin";
import { cookies, headers } from "next/headers";
import { hasAdminPermission, type PermissionCode } from "@velyq/auth";

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
  /*
   * `hasAdminPermission`, not `hasPermission`.
   *
   * The admin APIs authorize with `hasAdminPermission`, which requires role
   * ADMIN *and* `admin.access` *and* the specific permission. These pages
   * used `hasPermission`, which checks only that the permission code is
   * present -- so granting a fine-grained code like `audit.read` to a
   * non-admin role (a plausible read-only analyst setup, and nothing in the
   * schema forbids it) let that user render the full audit page including
   * every admin action's actor, while the API serving the same data answered
   * 403. The HTML page was the weaker door to identical data.
   *
   * Both doors now resolve authorization from the same function.
   */
  if (!hasAdminPermission(authentication.principal, permission)) {
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
