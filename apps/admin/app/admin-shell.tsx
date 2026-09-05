import type { ReactNode } from "react";
import { translator, type Locale } from "@velyq/ui";
import { getLocale } from "./locale";
import { LanguageSwitcher } from "./language-switcher";
import { VelyqMark } from "./logo";

/**
 * Admin console shell.
 *
 * Shares VELYQ's tokens, typography and primitives with the customer app, but
 * reads as platform operations rather than football intelligence: the accent
 * is the analytical cyan rather than pitch emerald, and the pitch motif is
 * deliberately absent.
 *
 * Navigation lists only routes that exist under `apps/admin/app`. `quality`
 * has a detail route but no index, so it is reachable from a quality
 * assessment and is intentionally not a nav destination.
 */

type NavItem = { href: string; label: string; icon: ReactNode };
type NavGroup = { heading: string | null; items: readonly NavItem[] };

function icon(path: ReactNode) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      height="17"
      width="17"
      viewBox="0 0 16 16"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {path}
    </svg>
  );
}

function navigation(locale: Locale): readonly NavGroup[] {
  const t = translator(locale);
  return [
    {
      heading: null,
      items: [
        {
          href: "/",
          label: t("adminNavOverview"),
          icon: icon(
            <>
              <rect x="2" y="2.5" width="5" height="5" rx="1" />
              <rect x="9" y="2.5" width="5" height="5" rx="1" />
              <rect x="2" y="9" width="5" height="4.5" rx="1" />
              <rect x="9" y="9" width="5" height="4.5" rx="1" />
            </>,
          ),
        },
      ],
    },
    {
      heading: t("adminNavGroupOperations"),
      items: [
        {
          href: "/provider-runs",
          label: t("adminNavProviderRuns"),
          icon: icon(
            <>
              <path d="M2.6 4.2h10.8M2.6 8h10.8M2.6 11.8h10.8" />
              <circle cx="5.2" cy="4.2" r="1.2" fill="currentColor" />
              <circle cx="10.4" cy="8" r="1.2" fill="currentColor" />
              <circle cx="6.6" cy="11.8" r="1.2" fill="currentColor" />
            </>,
          ),
        },
      ],
    },
    {
      heading: t("adminNavGroupIntelligence"),
      items: [
        {
          href: "/predictions",
          label: t("adminNavPredictions"),
          icon: icon(
            <>
              <path d="M2 12.4 5.8 7l3 2.8L14 3.6" />
              <path d="M10.6 3.6H14v3.4" />
            </>,
          ),
        },
        {
          href: "/scores",
          label: t("adminNavScores"),
          icon: icon(
            <>
              <circle cx="8" cy="8" r="5.6" />
              <circle cx="8" cy="8" r="2.2" />
              <path d="M8 8l3.9-3.4" />
            </>,
          ),
        },
      ],
    },
    {
      heading: t("adminNavGroupGovernance"),
      items: [
        {
          href: "/audit",
          label: t("adminNavAudit"),
          icon: icon(
            <>
              <path d="M4 2.5h6.2L13 5.2v8.3H4Z" />
              <path d="M6.2 8h4.2M6.2 10.6h3" />
            </>,
          ),
        },
      ],
    },
  ];
}

export async function AdminShell({
  children,
  active,
}: {
  children: ReactNode;
  /** Route to mark current. */
  active?: string;
}) {
  const locale = await getLocale();
  const t = translator(locale);
  const groups = navigation(locale);

  return (
    <div className="ops">
      <aside className="ops__sidebar">
        <a className="brand" href="/">
          <VelyqMark />
          <span className="brand__mark">VELYQ</span>
          <span className="brand__tag">{t("adminConsoleName")}</span>
        </a>

        <nav className="ops__nav" aria-label={t("adminNavLabel")}>
          {groups.map((group, index) => (
            <div className="ops__group" key={group.heading ?? `group-${index}`}>
              {group.heading ? (
                <p className="ops__group-heading">{group.heading}</p>
              ) : null}
              {group.items.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  {...(active === item.href
                    ? { "aria-current": "page" as const }
                    : {})}
                >
                  {item.icon}
                  {item.label}
                </a>
              ))}
            </div>
          ))}
        </nav>

        <div className="ops__foot">
          <LanguageSwitcher locale={locale} />
          <p className="ops__note">
            {t("adminSyntheticPhase")}
            <br />
            {t("adminReadOnly")} · {t("adminGoverned")}
          </p>
          <form action="/api/v1/auth/sign-out" method="post">
            <button
              className="button button--secondary button--block"
              type="submit"
            >
              {t("signOut")}
            </button>
          </form>
        </div>
      </aside>

      <div className="ops__topbar">
        <a className="brand" href="/">
          <VelyqMark />
          <span className="brand__mark">VELYQ</span>
          <span className="brand__tag">{t("adminConsoleName")}</span>
        </a>
        <span className="ops__status">
          <span className="badge__dot" />
          {t("adminServerAuthorized")}
        </span>
        <div className="ops__topbar-actions">
          <LanguageSwitcher locale={locale} />
        </div>
      </div>

      <main className="ops__main" id="main-content">
        {children}
      </main>

      <nav className="ops__bottomnav" aria-label={t("adminNavLabel")}>
        {groups
          .flatMap((group) => group.items)
          .map((item) => (
            <a
              key={item.href}
              href={item.href}
              {...(active === item.href
                ? { "aria-current": "page" as const }
                : {})}
            >
              {item.icon}
              {item.label}
            </a>
          ))}
      </nav>
    </div>
  );
}

/** Full-page state used for sign-in, denial and unavailable runtime. */
export async function AdminGate({
  kicker,
  title,
  body,
  children,
}: {
  kicker: string;
  title: string;
  body: string;
  children?: ReactNode;
}) {
  const locale = await getLocale();
  return (
    <main className="ops-gate" id="main-content">
      <div className="ops-gate__card">
        <a className="brand" href="/">
          <VelyqMark />
          <span className="brand__mark">VELYQ</span>
          <span className="brand__tag">
            {translator(locale)("adminConsoleName")}
          </span>
        </a>
        <div style={{ display: "grid", gap: "var(--space-3)" }}>
          <p className="eyebrow">{kicker}</p>
          <h1>{title}</h1>
          <p className="ops-gate__body">{body}</p>
        </div>
        {children}
      </div>
    </main>
  );
}
