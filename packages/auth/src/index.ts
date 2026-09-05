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

export type CustomerPlan = "FREE" | "PRO" | "ELITE";
export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "incomplete"
  | "incomplete_expired";
export type CustomerEntitlement =
  | "today.view"
  | "edge.preview"
  | "edge.full"
  | "radar.preview"
  | "radar.full"
  | "match.detail";

export type SubscriptionContext = Readonly<{
  plan: CustomerPlan;
  status: SubscriptionStatus | null;
}>;

const PLAN_ENTITLEMENTS: Readonly<
  Record<CustomerPlan, readonly CustomerEntitlement[]>
> = {
  FREE: ["today.view", "edge.preview", "radar.preview"],
  PRO: ["today.view", "edge.full", "radar.full", "match.detail"],
  ELITE: ["today.view", "edge.full", "radar.full", "match.detail"],
};

export function resolveCustomerEntitlements(context: SubscriptionContext) {
  const paidStatus =
    context.status === "active" || context.status === "trialing";
  const effectivePlan = paidStatus ? context.plan : "FREE";
  return Object.freeze({
    plan: effectivePlan,
    subscriptionStatus: context.status,
    entitlements: PLAN_ENTITLEMENTS[effectivePlan],
  });
}

export function hasCustomerEntitlement(
  resolved: ReturnType<typeof resolveCustomerEntitlements>,
  entitlement: CustomerEntitlement,
) {
  return resolved.entitlements.includes(entitlement);
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
