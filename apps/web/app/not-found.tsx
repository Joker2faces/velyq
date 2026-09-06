import { translator } from "@velyq/ui";
import { getNotFoundLocale } from "./locale";
import { PublicShell } from "./components/site-chrome";
import { ErrorState, ArrowLink } from "./components/ui";

/*
 * Without this file Next serves its own stock 404: an unstyled "This page
 * could not be found.", in English only, with no header, no footer, no
 * language switcher and no way back into the product. It looked like the site
 * had broken rather than like a mistyped address, and a Greek visitor got
 * English.
 */
export default async function NotFound() {
  const locale = await getNotFoundLocale();
  const t = translator(locale);
  return (
    <PublicShell locale={locale}>
      <div className="page">
        <ErrorState
          title={t("notFoundTitle")}
          body={t("notFoundBody")}
          action={<ArrowLink href="/">{t("backToHome")}</ArrowLink>}
        />
      </div>
    </PublicShell>
  );
}
