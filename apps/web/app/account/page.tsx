import {
  entitlementLabel,
  subscriptionStatusLabel,
  translator,
} from "@velyq/ui";
import { loadCustomerContext } from "../customer-runtime";
import { getLocale } from "../locale";
import { paidBillingConfigured } from "../plan-config";
import { CustomerShell } from "../customer-shell";
import { ArrowLink, Badge, Card, CardHead } from "../components/ui";
import { IconCheck, IconShield, IconSignOut } from "../components/icons";
import { LanguageSwitcher } from "../language-switcher";

export default async function Account() {
  const locale = await getLocale();
  const t = translator(locale);
  const context = await loadCustomerContext();
  const billingConfigured = paidBillingConfigured();
  const plan = context?.plan ?? "FREE";
  const entitlements = context?.entitlements ?? [];

  return (
    <CustomerShell active="/account">
      <div className="page">
        <div className="page__head">
          <div className="page__head-copy">
            <p className="eyebrow">{t("accountKicker")}</p>
            <h1>{t("accountTitle")}</h1>
            <p>{t("accountBody")}</p>
          </div>
          <div className="page__badges">
            <Badge tone="synthetic" dot>
              {t("syntheticData")}
            </Badge>
          </div>
        </div>

        <div className="stack">
          <Card>
            <div className="account-hero">
              <div style={{ display: "grid", gap: "var(--space-3)" }}>
                <p className="stat__label">{t("accountPlan")}</p>
                <div className="account-plan">
                  <span className="account-plan__name">{plan}</span>
                  <Badge tone={plan === "FREE" ? "neutral" : "positive"}>
                    {subscriptionStatusLabel(context?.status, locale)}
                  </Badge>
                </div>
                {context?.email ? (
                  <p className="card__hint">
                    {t("accountSignedInAs")} <strong>{context.email}</strong>
                  </p>
                ) : null}
                <p className="card__hint">{t("accountPlanNote")}</p>
              </div>
              <div className="actions">
                <a className="button button--primary" href="/pricing">
                  {t("accountUpgrade")}
                </a>
              </div>
            </div>
          </Card>

          <div className="split">
            <Card>
              <CardHead title={t("accountEntitlements")} />
              {entitlements.length > 0 ? (
                <ul className="checklist">
                  {entitlements.map((entitlement) => (
                    <li key={entitlement}>
                      <IconCheck />
                      {entitlementLabel(entitlement, locale)}
                    </li>
                  ))}
                </ul>
              ) : (
                /* Reached only when the entitlement service is unreachable;
                   an empty list is never a legitimate "you get nothing". */
                <p className="row__reason">{t("customerUnavailable")}</p>
              )}
            </Card>

            <Card>
              <CardHead title={t("accountBilling")} />
              <p className="row__reason">
                <span className="stat__label">{t("accountStatus")}</span>
                <br />
                {subscriptionStatusLabel(context?.status, locale)}
              </p>
              {billingConfigured ? (
                <form
                  action="/api/v1/billing/portal"
                  method="post"
                  style={{ marginTop: "var(--space-4)" }}
                >
                  <button className="button button--secondary" type="submit">
                    {t("accountManageBilling")}
                  </button>
                </form>
              ) : (
                <p
                  className="card__hint"
                  style={{ marginTop: "var(--space-3)" }}
                >
                  {t("accountBillingInactive")}
                </p>
              )}
            </Card>
          </div>

          <div className="split">
            <Card>
              <CardHead
                title={t("accountLanguage")}
                hint={t("accountLanguageBody")}
              />
              <LanguageSwitcher locale={locale} />
            </Card>

            <Card>
              <CardHead title={t("accountSecurity")} />
              <p className="row__reason">{t("accountSecurityBody")}</p>
              <div className="actions" style={{ marginTop: "var(--space-4)" }}>
                <a className="button button--ghost" href="/forgot-password">
                  {t("accountChangePassword")}
                </a>
                <form action="/api/v1/auth/sign-out" method="post">
                  <button className="button button--secondary" type="submit">
                    <IconSignOut size={15} />
                    {t("signOut")}
                  </button>
                </form>
              </div>
            </Card>
          </div>

          {/*
            The admin entry point lives in its own card, clearly separated from
            the plan. It is rendered only when the server-side principal holds
            admin.access; nothing here is derived from FREE / PRO / ELITE.
          */}
          {context?.isAdmin ? (
            <Card>
              <CardHead
                title={t("adminConsole")}
                aside={<Badge tone="market">admin.access</Badge>}
              />
              <p className="row__reason">{t("accountAdminNote")}</p>
              {process.env["NEXT_PUBLIC_VELYQ_ADMIN_URL"] ? (
                <div
                  className="actions"
                  style={{ marginTop: "var(--space-4)" }}
                >
                  <a
                    className="button button--secondary"
                    href={process.env["NEXT_PUBLIC_VELYQ_ADMIN_URL"]}
                  >
                    <IconShield size={15} />
                    {t("adminConsole")}
                  </a>
                </div>
              ) : null}
            </Card>
          ) : null}

          <Card>
            <CardHead title={t("accountEnvironment")} />
            <p className="row__reason">{t("homeNoticeBody")}</p>
            <p style={{ marginTop: "var(--space-3)" }}>
              <ArrowLink href="/responsible-use">
                {t("homeNoticeLink")}
              </ArrowLink>
            </p>
          </Card>
        </div>
      </div>
    </CustomerShell>
  );
}
