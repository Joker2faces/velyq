export const CUSTOMER_PLANS = {
  FREE: { label: "Free", introductoryMonthlyEur: 0 },
  PRO: { label: "Pro", introductoryMonthlyEur: 19 },
  ELITE: { label: "Elite", introductoryMonthlyEur: 49 },
} as const;

export function paidBillingConfigured() {
  return Boolean(
    process.env["STRIPE_SECRET_KEY"] &&
    process.env["STRIPE_PRO_PRICE_ID"] &&
    process.env["STRIPE_ELITE_PRICE_ID"],
  );
}
