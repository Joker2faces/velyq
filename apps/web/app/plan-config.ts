import { formatPrice, translator, type Locale } from "@velyq/ui";

/**
 * Customer subscription plans.
 *
 * FREE / PRO / ELITE are billing tiers. They are not authorization roles:
 * administrator access is granted by database permissions and is resolved
 * server-side, entirely independently of anything in this file.
 */
export const CUSTOMER_PLANS = {
  FREE: { label: "Free", introductoryMonthlyEur: 0 },
  PRO: { label: "Pro", introductoryMonthlyEur: 19 },
  ELITE: { label: "Elite", introductoryMonthlyEur: 49 },
} as const;

export type PlanCode = keyof typeof CUSTOMER_PLANS;

export type PaidPlan = "PRO" | "ELITE";
export type BillingPriceConfiguration = Readonly<Record<PaidPlan, string>>;

export function billingPriceConfiguration(
  environment: Record<string, string | undefined> = process.env,
): BillingPriceConfiguration | null {
  const pro = environment["STRIPE_PRO_PRICE_ID"]?.trim();
  const elite = environment["STRIPE_ELITE_PRICE_ID"]?.trim();
  if (!pro || !elite || pro === elite) return null;
  return Object.freeze({ PRO: pro, ELITE: elite });
}

export function paidBillingConfigured() {
  return Boolean(
    process.env["STRIPE_SECRET_KEY"] && billingPriceConfiguration(),
  );
}

export type PlanPresentation = {
  code: PlanCode;
  name: string;
  audience: string;
  pitch: string;
  price: string;
  pricePeriod: string;
  features: readonly string[];
  limit: string;
  featured: boolean;
};

/**
 * Localized plan presentation.
 *
 * The feature lists describe what each tier actually grants today. ELITE
 * currently resolves to the same entitlement set as PRO in `@velyq/auth`, so
 * its card says so plainly in `limit` rather than implying capability that
 * does not exist. See the handoff note for Codex.
 */
export function planCatalog(locale: Locale): readonly PlanPresentation[] {
  const t = translator(locale);
  return [
    {
      code: "FREE",
      name: t("planFreeName"),
      audience: t("planFreeFor"),
      pitch: t("planFreePitch"),
      price: formatPrice(CUSTOMER_PLANS.FREE.introductoryMonthlyEur, locale),
      pricePeriod: t("pricingFreeWhileBeta"),
      features: [
        t("planFreeFeature1"),
        t("planFreeFeature2"),
        t("planFreeFeature3"),
      ],
      limit: t("planFreeLimit"),
      featured: false,
    },
    {
      code: "PRO",
      name: t("planProName"),
      audience: t("planProFor"),
      pitch: t("planProPitch"),
      price: formatPrice(CUSTOMER_PLANS.PRO.introductoryMonthlyEur, locale),
      pricePeriod: t("pricingPerMonth"),
      features: [
        t("planProFeature1"),
        t("planProFeature2"),
        t("planProFeature3"),
        t("planProFeature4"),
      ],
      limit: t("planProLimit"),
      featured: true,
    },
    {
      code: "ELITE",
      name: t("planEliteName"),
      audience: t("planEliteFor"),
      pitch: t("planElitePitch"),
      price: formatPrice(CUSTOMER_PLANS.ELITE.introductoryMonthlyEur, locale),
      pricePeriod: t("pricingPerMonth"),
      features: [
        t("planEliteFeature1"),
        t("planEliteFeature2"),
        t("planEliteFeature3"),
      ],
      limit: t("planEliteLimit"),
      featured: false,
    },
  ];
}
