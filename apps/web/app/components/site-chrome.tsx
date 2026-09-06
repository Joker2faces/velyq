import Link from "next/link";
import type { ReactNode } from "react";
import { translate, translator, type Locale } from "@velyq/ui";
import { LanguageSwitcher } from "../language-switcher";
import { LocalePreference } from "../locale-preference";
import { VelyqMark } from "./logo";
import { localePath } from "../locale-path";

/**
 * Public marketing chrome: header, footer and the shell that wraps them.
 *
 * `header` and `footer` are siblings of `main`, not children of it, so the
 * page exposes real `banner`, `main` and `contentinfo` landmarks.
 */

export function Brand({
  href = "/",
  locale,
}: {
  href?: string;
  locale: Locale;
}) {
  return (
    <Link className="brand" href={localePath(href, locale)}>
      <VelyqMark />
      <span className="brand__mark">VELYQ</span>
      <span className="brand__tag">{translate("brandTagline", locale)}</span>
    </Link>
  );
}

export function SiteHeader({ locale }: { locale: Locale }) {
  const t = translator(locale);
  return (
    <header className="shell-header">
      <div className="shell-header__inner">
        <Brand locale={locale} />
        <nav className="shell-header__nav" aria-label={t("navPlatform")}>
          <a href={localePath("/#modules", locale)}>{t("navPlatform")}</a>
          <a href={localePath("/pricing", locale)}>{t("navPricing")}</a>
          <a href={localePath("/responsible-use", locale)}>
            {t("navResponsibleUse")}
          </a>
        </nav>
        <div className="shell-header__actions">
          <LanguageSwitcher locale={locale} />
          <a
            className="button button--ghost shell-header__signin"
            href={localePath("/sign-in", locale)}
          >
            {t("homeSignIn")}
          </a>
          <a
            className="button button--primary"
            href={localePath("/sign-up", locale)}
          >
            {t("homeCreateAccount")}
          </a>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter({ locale }: { locale: Locale }) {
  const t = translator(locale);
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div>
          <Brand locale={locale} />
          <p
            className="card__hint"
            style={{ marginTop: "var(--space-3)", maxWidth: "34ch" }}
          >
            {t("footerRights")}
          </p>
        </div>
        <nav className="site-footer__legal" aria-label={t("legalKicker")}>
          <a href={localePath("/terms", locale)}>{t("footerTerms")}</a>
          <a href={localePath("/privacy", locale)}>{t("footerPrivacy")}</a>
          <a href={localePath("/responsible-use", locale)}>
            {t("footerResponsibleUse")}
          </a>
          <a href={localePath("/subscription-terms", locale)}>
            {t("footerSubscriptionTerms")}
          </a>
        </nav>
      </div>
      <div className="site-footer__inner" style={{ paddingTop: 0 }}>
        <div className="site-footer__meta">
          <span>© {new Date().getUTCFullYear()} VELYQ</span>
          {/* Creator credit: present and legible, deliberately secondary.
              The name is a proper noun and stays identical in both locales. */}
          <span className="credit">
            {t("footerCreatedBy")}{" "}
            <span className="credit__name">Joker2face</span>
          </span>
        </div>
      </div>
    </footer>
  );
}

/** Shell for every public, unauthenticated page. */
export function PublicShell({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  return (
    <div className="public">
      {/* Static pages cannot read the locale cookie server-side; this sends a
          returning Greek visitor to the Greek copy. */}
      <LocalePreference locale={locale} />
      <SiteHeader locale={locale} />
      <main className="public__main" id="main-content">
        {children}
      </main>
      <SiteFooter locale={locale} />
    </div>
  );
}
