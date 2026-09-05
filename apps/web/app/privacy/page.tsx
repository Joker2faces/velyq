import { translator } from "@velyq/ui";
import { getLocale } from "../locale";
import { LegalPage } from "../components/legal-page";

export default async function Privacy() {
  const locale = await getLocale();
  const t = translator(locale);
  return (
    <LegalPage locale={locale} title={t("privacyTitle")}>
      <p>{t("privacyBody1")}</p>
      <p>{t("privacyBody2")}</p>
    </LegalPage>
  );
}
