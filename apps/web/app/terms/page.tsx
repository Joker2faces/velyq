import { translator } from "@velyq/ui";
import { getLocale } from "../locale";
import { LegalPage } from "../components/legal-page";

export default async function Terms() {
  const locale = await getLocale();
  const t = translator(locale);
  return (
    <LegalPage locale={locale} title={t("termsTitle")}>
      <p>{t("termsBody1")}</p>
      <p>{t("termsBody2")}</p>
    </LegalPage>
  );
}
