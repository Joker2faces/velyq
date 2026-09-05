import Link from "next/link";
import type { ReactNode } from "react";
import { translator, type Locale } from "@velyq/ui";
import { LanguageSwitcher } from "../language-switcher";

/**
 * Public marketing chrome: header, footer and the shell that wraps them.
 *
 * `header` and `footer` are siblings of `main`, not children of it, so the
 * page exposes real `banner`, `main` and `contentinfo` landmarks.
 */

export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link className="brand" href={href}>
      <span className="brand__mark">VELYQ</span>
      <span className="brand__tag" aria-hidden="true">
        Intelligence
      </span>
    </Link>
  );
}

export function SiteHeader({ locale }: { locale: Locale }) {
  const t = translator(locale);
  return (
    <header className="shell-header">
      <div className="shell-header__inner">
        <Brand />
        <nav className="shell-header__nav" aria-label={t("navPlatform")}>
          <a href="/#modules">{t("navPlatform")}</a>
          <a href="/pricing">{t("navPricing")}</a>
          <a href="/responsible-use">{t("navResponsibleUse")}</a>
        </nav>
        <div className="shell-header__actions">
          <LanguageSwitcher locale={locale} />
          <a
            className="button button--ghost shell-header__signin"
            href="/sign-in"
          >
            {t("homeSignIn")}
          </a>
          <a className="button button--primary" href="/sign-up">
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
          <Brand />
          <p
            className="card__hint"
            style={{ marginTop: "var(--space-3)", maxWidth: "34ch" }}
          >
            {t("footerRights")}
          </p>
        </div>
        <nav className="site-footer__legal" aria-label={t("legalKicker")}>
          <a href="/terms">{t("footerTerms")}</a>
          <a href="/privacy">{t("footerPrivacy")}</a>
          <a href="/responsible-use">{t("footerResponsibleUse")}</a>
          <a href="/subscription-terms">{t("footerSubscriptionTerms")}</a>
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
      <SiteHeader locale={locale} />
      <main className="public__main" id="main-content">
        {children}
      </main>
      <SiteFooter locale={locale} />
    </div>
  );
}
