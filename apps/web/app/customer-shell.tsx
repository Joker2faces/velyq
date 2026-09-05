import Link from "next/link";
import type { ReactNode } from "react";
import { translator, type Locale } from "@velyq/ui";
import { loadCustomerContext } from "./customer-runtime";
import { getLocale } from "./locale";
import { LanguageSwitcher } from "./language-switcher";
import { Brand } from "./components/site-chrome";
import {
  IconAccount,
  IconEdge,
  IconPricing,
  IconRadar,
  IconShield,
  IconSignOut,
  IconToday,
} from "./components/icons";

/**
 * Authenticated customer shell.
 *
 * Desktop gets a persistent sidebar; below 70rem that is replaced by a
 * compact top bar plus a bottom navigation bar, rather than a squeezed
 * desktop sidebar. `aria-current="page"` marks the active route in both.
 */

type NavItem = {
  href: string;
  label: string;
  icon: (props: { size?: number }) => ReactNode;
};

function navigation(locale: Locale): readonly NavItem[] {
  const t = translator(locale);
  return [
    { href: "/today", label: t("navToday"), icon: IconToday },
    { href: "/edge", label: t("navEdge"), icon: IconEdge },
    { href: "/radar", label: t("navRadar"), icon: IconRadar },
    { href: "/pricing", label: t("navPricing"), icon: IconPricing },
    { href: "/account", label: t("navAccount"), icon: IconAccount },
  ];
}

export async function CustomerShell({
  children,
  active,
}: {
  children: ReactNode;
  /** Route that should be marked current; omitted on detail pages. */
  active?: string;
}) {
  const locale = await getLocale();
  const t = translator(locale);
  const context = await loadCustomerContext();
  const items = navigation(locale);

  return (
    <div className="app">
      <aside className="app__sidebar">
        <Brand href="/today" />
        <nav className="app__nav" aria-label={t("navPrimaryLabel")}>
          {items.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              {...(active === href ? { "aria-current": "page" as const } : {})}
            >
              <Icon size={17} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="app__sidebar-foot">
          <LanguageSwitcher locale={locale} />
          {/* Rendered only when the server-side principal actually carries
              admin.access. Never inferred from the customer's plan. */}
          {context?.isAdmin && process.env["NEXT_PUBLIC_VELYQ_ADMIN_URL"] ? (
            <a
              className="button button--ghost button--block"
              href={process.env["NEXT_PUBLIC_VELYQ_ADMIN_URL"]}
            >
              <IconShield size={15} />
              {t("adminConsole")}
            </a>
          ) : null}
          <p className="app__note">
            {t("syntheticEnvironment")}
            <br />
            {t("researchUse")}
          </p>
          <form action="/api/v1/auth/sign-out" method="post">
            <button
              className="button button--secondary button--block"
              type="submit"
            >
              <IconSignOut size={15} />
              {t("signOut")}
            </button>
          </form>
        </div>
      </aside>

      <div className="app__topbar">
        <div className="app__mobile-brand">
          <Brand href="/today" />
        </div>
        <span className="app__session">
          <span className="badge__dot" />
          {t("sessionActive")}
        </span>
        {/* Compact duplicates of the sidebar controls, shown only while the
            sidebar is collapsed. */}
        <div className="app__topbar-actions">
          <LanguageSwitcher locale={locale} />
          <form action="/api/v1/auth/sign-out" method="post">
            <button
              className="button button--ghost"
              type="submit"
              aria-label={t("signOut")}
            >
              <IconSignOut size={15} />
            </button>
          </form>
        </div>
      </div>

      <main className="app__main" id="main-content">
        {children}
      </main>

      <nav className="app__bottomnav" aria-label={t("navPrimaryLabel")}>
        {items.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            {...(active === href ? { "aria-current": "page" as const } : {})}
          >
            <Icon size={19} />
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
