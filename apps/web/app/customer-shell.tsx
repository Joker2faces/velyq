import Link from "next/link";
import type { ReactNode } from "react";
import { message } from "@velyq/ui";
import { loadCustomerContext } from "./customer-runtime";
import { LanguageSwitcher } from "./language-switcher";

export async function CustomerShell({ children }: { children: ReactNode }) {
  const context = await loadCustomerContext();
  const navigation = [
    [message("navToday"), "/today"],
    [message("navEdge"), "/edge"],
    [message("navRadar"), "/radar"],
    [message("navAccount"), "/account"],
  ] as const;
  return (
    <div className="customer-app">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <aside>
        <Link className="brand" href="/today">
          VELYQ <small>INTELLIGENCE PLATFORM</small>
        </Link>
        <p className="nav-label">INTELLIGENCE</p>
        <nav aria-label="Primary navigation">
          {navigation.map(([label, href]) => (
            <Link key={href} href={href}>
              {label}
            </Link>
          ))}
        </nav>
        <LanguageSwitcher />
        {context?.isAdmin ? (
          <a
            className="admin-link"
            href={process.env["NEXT_PUBLIC_VELYQ_ADMIN_URL"]}
          >
            Admin console →
          </a>
        ) : null}
        <div className="side-note">
          Synthetic beta environment
          <br />
          <span>EXPERIMENTAL // RESEARCH USE</span>
        </div>
        <form action="/api/v1/auth/sign-out" method="post" className="sign-out">
          <button type="submit">{message("signOut")}</button>
        </form>
      </aside>
      <main id="main-content" className="customer-main">
        <header className="topbar">
          <span>VELYQ / CUSTOMER INTELLIGENCE</span>
          <span className="live-dot">● SECURE SESSION</span>
        </header>
        {children}
      </main>
    </div>
  );
}

export function Metric({
  label,
  value,
  tone = "",
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className={`metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
export function Status({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return (
    <span className={`status ${tone}`} role="status" aria-live="polite">
      {children}
    </span>
  );
}
