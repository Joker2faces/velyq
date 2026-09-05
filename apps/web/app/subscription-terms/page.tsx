import { translator } from "@velyq/ui";
import { getLocale } from "../locale";
import { LegalPage } from "../components/legal-page";

export default async function SubscriptionTerms() {
  const locale = await getLocale();
  const t = translator(locale);
  return (
    <LegalPage locale={locale} title={t("subscriptionTermsTitle")}>
      <p>{t("subscriptionBody1")}</p>
      <p>{t("subscriptionBody2")}</p>
    </LegalPage>
  );
}
