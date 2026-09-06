import type { CustomerPlan, SubscriptionStatus } from "@velyq/auth";

/** What `/api/v1/customer/context` returns: the customer's own state. */
export type CustomerContextDto = {
  readonly email: string;
  readonly plan: CustomerPlan;
  readonly status: SubscriptionStatus | null;
  readonly entitlements: readonly string[];
  readonly isAdmin: boolean;
};
