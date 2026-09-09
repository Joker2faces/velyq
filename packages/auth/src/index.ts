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
  | "incomplete_expired"
  | "paused";
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
  PRO: ["today.view", "edge.full", "radar.full"],
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
export function hasAdminPermission(
  principal: Principal | null,
  permission: PermissionCode,
) {
  return (
    principal?.role === "ADMIN" &&
    principal.permissions.includes("admin.access") &&
    principal.permissions.includes(permission)
  );
}

export function hasTrustedRequestOrigin(
  submittedOrigin: string | null,
  expectedOrigin: string,
) {
  return submittedOrigin === expectedOrigin;
}
export function requirePermission(
  principal: Principal | null,
  permission: PermissionCode,
) {
  if (!hasPermission(principal, permission)) throw new Error("FORBIDDEN");
  return principal;
}

const ALL_CUSTOMER_ENTITLEMENTS: readonly CustomerEntitlement[] = [
  "today.view",
  "edge.preview",
  "edge.full",
  "radar.preview",
  "radar.full",
  "match.detail",
];

/**
 * Whether a principal may inspect the whole product irrespective of billing.
 *
 * FREE / PRO / ELITE are commercial tiers, not authorization roles. Before
 * this existed, entitlements were resolved from the subscription row alone,
 * so an operator with no subscription resolved to FREE and was shown the
 * ELITE upgrade wall on Match Intelligence -- billing (deliberately
 * deferred) had become a prerequisite for testing the product we ship.
 *
 * The decision is taken from database permission rows, exactly like every
 * other permission in this module, so a client cannot assert it: a forged
 * cookie still has to resolve to an ADMIN row holding `admin.access`. It
 * deliberately does not widen `customer.read`, and it leaves the plan
 * matrix untouched so commercial gating stays enforceable once billing
 * ships.
 */
export function grantsFullProductAccess(principal: Principal | null) {
  return (
    principal?.role === "ADMIN" &&
    principal.permissions.includes("admin.access")
  );
}

/**
 * The entitlements that actually apply to a request, combining the
 * commercial tier with role-based administrative access.
 *
 * The reported `plan` and `subscriptionStatus` stay truthful -- an
 * administrator on no subscription is still FREE, and Account says so. Only
 * the capability set is widened, which is what authorization consumes.
 */
export function resolveEffectiveEntitlements(
  context: SubscriptionContext,
  principal: Principal | null,
) {
  const resolved = resolveCustomerEntitlements(context);
  if (!grantsFullProductAccess(principal)) return resolved;
  return Object.freeze({
    plan: resolved.plan,
    subscriptionStatus: resolved.subscriptionStatus,
    entitlements: ALL_CUSTOMER_ENTITLEMENTS,
  });
}
