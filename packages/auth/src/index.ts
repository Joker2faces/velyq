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
  PRO: [
    "today.view",
    "edge.preview",
    "edge.full",
    "radar.preview",
    "radar.full",
  ],
  ELITE: [
    "today.view",
    "edge.preview",
    "edge.full",
    "radar.preview",
    "radar.full",
    "match.detail",
  ],
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

/** Every customer-facing entitlement that exists. Not a plan — nothing here
    is ever presented as a subscription tier. */
const ALL_CUSTOMER_ENTITLEMENTS: readonly CustomerEntitlement[] =
  PLAN_ENTITLEMENTS.ELITE;

export type EffectiveCustomerAccess = Readonly<{
  /** The commercial plan actually on file. Never widened by internal access:
      an administrator with no subscription still reports FREE here. */
  plan: CustomerPlan;
  subscriptionStatus: SubscriptionStatus | null;
  /** Everything this principal may act on — the plan's grants, or every
      entitlement when `internalAccess` is true. */
  entitlements: readonly CustomerEntitlement[];
  /** True when `entitlements` was widened by `admin.access` rather than
      earned by the plan above. The one fact a customer surface needs in
      order to say *why* access is unlocked without pretending it was paid
      for. */
  internalAccess: boolean;
}>;

/**
 * The single place a request's real customer-facing access is decided.
 *
 * Subscription plan and administrator permission are independent facts about
 * a principal — that is the architecture, and it was already correct at the
 * type level. What was missing is this function: every caller resolved
 * entitlements from `{ plan, status }` alone and never consulted the
 * principal it had already fetched, so an ADMIN principal with no paid
 * subscription was resolved to FREE and gated exactly like any other
 * unpaid visitor. `match.detail`, `edge.full` and `radar.full` all fell
 * behind a paywall for the one account that exists specifically to inspect
 * the product without buying it.
 *
 * The fix is not `if (isAdmin)` scattered across pages — every caller in the
 * app now goes through this one resolver, so the rule lives in exactly one
 * place. An administrator held for internal QA gets every customer-facing
 * entitlement; their displayed plan and subscription status are never
 * altered to explain why, because that would misstate their actual billing
 * relationship. `plan` and `subscriptionStatus` here are always the
 * commercial answer; `internalAccess` is the honest reason entitlements are
 * wider than that answer would otherwise allow.
 *
 * Deliberately does not accept a bare boolean: taking the whole `Principal`
 * means the ADMIN role check and the `admin.access` permission check both
 * happen here, once, rather than being re-derived (and potentially
 * mis-derived — e.g. from a plan) at each call site.
 */
export function resolveEffectiveCustomerAccess(
  context: SubscriptionContext,
  principal: Principal | null,
): EffectiveCustomerAccess {
  const commercial = resolveCustomerEntitlements(context);
  const internalAccess =
    principal?.role === "ADMIN" &&
    principal.permissions.includes("admin.access");
  return Object.freeze({
    plan: commercial.plan,
    subscriptionStatus: commercial.subscriptionStatus,
    entitlements: internalAccess
      ? ALL_CUSTOMER_ENTITLEMENTS
      : commercial.entitlements,
    internalAccess,
  });
}

export function hasEffectiveEntitlement(
  access: EffectiveCustomerAccess,
  entitlement: CustomerEntitlement,
) {
  return access.entitlements.includes(entitlement);
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
