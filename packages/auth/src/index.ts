export type PermissionCode =
  | "customer.read"
  | "admin.access"
  | "provider_runs.read"
  | "predictions.trace"
  | "scores.inspect"
  | "quality.inspect"
  | "audit.read";
export type Principal = Readonly<{
  userId: string;
  role: "CUSTOMER" | "ADMIN";
  permissions: readonly PermissionCode[];
}>;
export interface PermissionResolver {
  resolve(userId: string): Promise<Principal | null>;
}
export function principalFromPermissionRows(
  userId: string,
  roleCode: string | null,
  permissionCodes: readonly string[],
): Principal {
  return Object.freeze({
    userId,
    role: roleCode === "ADMIN" ? "ADMIN" : "CUSTOMER",
    permissions: [...new Set(permissionCodes)].filter(isPermissionCode),
  });
}
function isPermissionCode(value: string): value is PermissionCode {
  return [
    "customer.read",
    "admin.access",
    "provider_runs.read",
    "predictions.trace",
    "scores.inspect",
    "quality.inspect",
    "audit.read",
  ].includes(value);
}
export function hasPermission(
  principal: Principal | null,
  permission: PermissionCode,
) {
  return principal?.permissions.includes(permission) ?? false;
}
export function requirePermission(
  principal: Principal | null,
  permission: PermissionCode,
) {
  if (!hasPermission(principal, permission)) throw new Error("FORBIDDEN");
  return principal;
}
