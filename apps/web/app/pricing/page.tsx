import { translator } from "@velyq/ui";
import { getLocale } from "../locale";
import { paidBillingConfigured, planCatalog } from "../plan-config";
import { PublicShell } from "../components/site-chrome";
import { Badge, Card } from "../components/ui";
import { IconCheck, IconShield } from "../components/icons";

/**
 * Pricing.
 *
 * This page is deliberately **public**. It previously rendered inside
 * `CustomerShell`, which requires a session, so every logged-out visitor who
 * followed the "Pricing" link from the public homepage was redirected to
 * sign-in and never saw a price.
 */
export default async function Pricing() {
  const locale = await getLocale();
  const t = translator(locale);
  const billingConfigured = paidBillingConfigured();
  const plans = planCatalog(locale);

  return (
    <PublicShell locale={locale}>
      <section className="section">
        <div className="section__head">
          <p className="eyebrow">{t("pricingKicker")}</p>
          <h1>{t("pricingTitle")}</h1>
          <p>{t("pricingBody")}</p>
        </div>

        <div className="plans">
          {plans.map((plan) => (
            <Card
              key={plan.code}
              className={`plan${plan.featured ? " plan--featured" : ""}`}
            >
              {plan.featured ? (
                <span className="plan__ribbon">
                  <Badge tone="positive">{t("pricingMostPopular")}</Badge>
                </span>
              ) : null}

              <div>
                {/* The plan name is the heading. Previously the marketing
                    sentence was the h2 and the plan name a kicker, so a
                    heading list never contained the words FREE, PRO, ELITE. */}
                <h2 className="plan__name">{plan.name}</h2>
                <p className="plan__for">{plan.audience}</p>
              </div>

              <p className="plan__pitch">{plan.pitch}</p>

              <div className="plan__price">
                <span className="plan__amount">{plan.price}</span>
                <span className="plan__period">{plan.pricePeriod}</span>
              </div>

              <div>
                <p
                  className="stat__label"
                  style={{ marginBottom: "var(--space-3)" }}
                >
                  {t("pricingIncluded")}
                </p>
                <ul className="plan__features">
                  {plan.features.map((feature) => (
                    <li key={feature}>
                      <IconCheck />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>

              <p className="plan__limit">
                <span className="sr-only">{t("pricingLimits")}: </span>
                {plan.limit}
              </p>

              <div className="plan__cta">
                {plan.code === "FREE" ? (
                  <a
                    className="button button--secondary button--block"
                    href="/sign-up"
                  >
                    {t("homeCreateAccount")}
                  </a>
                ) : billingConfigured ? (
                  <form action="/api/v1/billing/checkout" method="post">
                    <input type="hidden" name="plan" value={plan.code} />
                    <button
                      className={`button button--block ${
                        plan.featured ? "button--primary" : "button--secondary"
                      }`}
                      type="submit"
                    >
                      {t("pricingStartCheckout")}
                    </button>
                  </form>
                ) : (
                  <>
                    <span
                      className="button button--ghost button--block"
                      aria-disabled="true"
                      role="note"
                    >
                      {t("pricingBillingPending")}
                    </span>
                    <p
                      className="card__hint"
                      style={{ marginTop: "var(--space-2)" }}
                    >
                      {t("pricingBillingPendingHint")}
                    </p>
                  </>
                )}
              </div>
            </Card>
          ))}
        </div>

        {/* The plan/permission boundary, stated where ELITE is actually read. */}
        <div className="notice" style={{ marginTop: "var(--space-6)" }}>
          <h2>
            <IconShield size={20} />
            {t("pricingNotAdminTitle")}
          </h2>
          <p>{t("pricingNotAdminBody")}</p>
        </div>

        <p className="fine-print" style={{ marginTop: "var(--space-5)" }}>
          {t("pricingFineprint")}
        </p>
      </section>
    </PublicShell>
  );
}
