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
