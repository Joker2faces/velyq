import { translator } from "@velyq/ui";
import { getLocale } from "../locale";
import { LegalPage } from "../components/legal-page";

export default async function ResponsibleUse() {
  const locale = await getLocale();
  const t = translator(locale);
  return (
    <LegalPage locale={locale} title={t("responsibleUseHeading")}>
      <p>{t("responsibleUseBody1")}</p>
      <p>{t("responsibleUseBody2")}</p>
    </LegalPage>
  );
}
