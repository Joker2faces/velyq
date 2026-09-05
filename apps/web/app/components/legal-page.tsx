import type { ReactNode } from "react";
import type { Locale } from "@velyq/ui";
import { translator } from "@velyq/ui";
import { PublicShell } from "./site-chrome";

/** Shared layout for the four public legal pages. */
export function LegalPage({
  locale,
  title,
  children,
}: {
  locale: Locale;
  title: string;
  children: ReactNode;
}) {
  const t = translator(locale);
  return (
    <PublicShell locale={locale}>
      <section className="section">
        <div className="section__head">
          <p className="eyebrow">{t("legalKicker")}</p>
          <h1>{title}</h1>
        </div>
        <div className="prose">{children}</div>
      </section>
    </PublicShell>
  );
}
