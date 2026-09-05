import {
  resolveCustomerEntitlements,
  type CustomerEntitlement,
  type CustomerPlan,
} from "@velyq/auth";
import {
  entitlementLabel,
  formatPrice,
  translator,
  type Locale,
} from "@velyq/ui";

/**
 * Customer subscription plans.
 *
 * FREE / PRO / ELITE are billing tiers. They are not authorization roles:
 * administrator access is granted by database permissions and resolved
 * server-side, entirely independently of anything in this file.
 */
export const CUSTOMER_PLANS = {
  FREE: { label: "Free", introductoryMonthlyEur: 0 },
  PRO: { label: "Pro", introductoryMonthlyEur: 19 },
  ELITE: { label: "Elite", introductoryMonthlyEur: 49 },
} as const;

export type PlanCode = keyof typeof CUSTOMER_PLANS;

const PLAN_ORDER: readonly PlanCode[] = ["FREE", "PRO", "ELITE"];

export function paidBillingConfigured() {
  return Boolean(
    process.env["STRIPE_SECRET_KEY"] &&
    process.env["STRIPE_PRO_PRICE_ID"] &&
    process.env["STRIPE_ELITE_PRICE_ID"],
  );
}

/**
 * The entitlements a plan actually grants, read from `@velyq/auth`.
 *
 * `resolveCustomerEntitlements` is the same function the authenticated app
 * uses, so the pricing page can never advertise a capability the server does
 * not grant. A paid status is supplied for the paid tiers because the
 * resolver downgrades an unpaid subscription to FREE — here we are
 * describing the offer, not a particular customer's state.
 */
function entitlementsFor(plan: PlanCode): readonly CustomerEntitlement[] {
  return resolveCustomerEntitlements({
    plan: plan as CustomerPlan,
    status: plan === "FREE" ? null : "active",
  }).entitlements;
}

export type PlanPresentation = {
  code: PlanCode;
  name: string;
  audience: string;
  pitch: string;
  price: string;
  pricePeriod: string;
  /** Everything the tier grants, in plain language. */
  features: readonly string[];
  /** Only what this tier adds over the one below it. */
  additions: readonly string[];
  limit: string;
  featured: boolean;
};

/**
 * Localized plan presentation, derived from the live entitlement matrix.
 *
 * Feature lists are generated rather than hand-written, so they cannot drift
 * away from what the server grants. When a tier adds nothing over the tier
 * below — which is currently true of ELITE on this branch — the card says so
 * plainly instead of implying capability that does not exist.
 */
export function planCatalog(locale: Locale): readonly PlanPresentation[] {
  const t = translator(locale);

  const copy = {
    FREE: {
      audience: t("planFreeFor"),
      pitch: t("planFreePitch"),
      pricePeriod: t("pricingFreeWhileBeta"),
      limit: t("planFreeLimit"),
      featured: false,
    },
    PRO: {
      audience: t("planProFor"),
      pitch: t("planProPitch"),
      pricePeriod: t("pricingPerMonth"),
      limit: t("planProLimit"),
      featured: true,
    },
    ELITE: {
      audience: t("planEliteFor"),
      pitch: t("planElitePitch"),
      pricePeriod: t("pricingPerMonth"),
      limit: t("planEliteLimit"),
      featured: false,
    },
  } as const;

  return PLAN_ORDER.map((code, index) => {
    const granted = entitlementsFor(code);
    // The entry tier has no tier below it, so nothing it grants is an
    // "addition" — marking every FREE feature as new was meaningless.
    const added =
      index === 0
        ? []
        : granted.filter(
            (entitlement) =>
              !entitlementsFor(PLAN_ORDER[index - 1]!).includes(entitlement),
          );

    return {
      code,
      name: code,
      audience: copy[code].audience,
      pitch: copy[code].pitch,
      price: formatPrice(CUSTOMER_PLANS[code].introductoryMonthlyEur, locale),
      pricePeriod: copy[code].pricePeriod,
      features: granted.map((entitlement) =>
        entitlementLabel(entitlement, locale),
      ),
      additions: added.map((entitlement) =>
        entitlementLabel(entitlement, locale),
      ),
      // A tier that grants nothing new must admit it; the copy string for
      // ELITE says exactly that while its entitlements match PRO.
      limit:
        index > 0 && added.length === 0
          ? t("planNoAdditionalAccess")
          : copy[code].limit,
      featured: copy[code].featured,
    };
  });
}
