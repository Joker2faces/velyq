import Link from "next/link";
import type { ReactNode } from "react";
import { message } from "@velyq/ui";

export function CustomerShell({ children }: { children: ReactNode }) {
  const navigation = [
    [message("navToday"), "/today"],
    [message("navEdge"), "/edge"],
    [message("navRadar"), "/radar"],
    [
      message("navMatchIntelligence"),
      "/matches/73000000-0000-4000-8000-000000000001",
    ],
    [message("navAccount"), "/account"],
  ] as const;
  return (
    <div className="customer-app">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <aside>
        <Link className="brand" href="/today">
          VELYQ <small>STAGING</small>
        </Link>
        <p className="nav-label">INTELLIGENCE</p>
        <nav aria-label="Primary navigation">
          {navigation.map(([label, href]) => (
            <Link key={href} href={href}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="side-note">
          Synthetic Phase 1 data only
          <br />
          <span>EXPERIMENTAL // DEVELOPMENT</span>
        </div>
        <form action="/api/v1/auth/sign-out" method="post" className="sign-out">
          <button type="submit">{message("signOut")}</button>
        </form>
      </aside>
      <main id="main-content" className="customer-main">
        <header className="topbar">
          <span>PHASE 1 / CUSTOMER PREVIEW</span>
          <span className="live-dot">● SYSTEM ONLINE</span>
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
