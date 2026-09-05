export const CUSTOMER_PLANS = {
  FREE: { label: "Free", introductoryMonthlyEur: 0 },
  PRO: { label: "Pro", introductoryMonthlyEur: 19 },
  ELITE: { label: "Elite", introductoryMonthlyEur: 49 },
} as const;

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
