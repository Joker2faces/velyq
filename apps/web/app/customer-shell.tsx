import Link from "next/link";
import type { ReactNode } from "react";

export function CustomerShell({ children }: { children: ReactNode }) {
  const navigation = [
    ["Today", "/today"],
    ["Edge", "/edge"],
    ["Radar", "/radar"],
    ["Match Intelligence", "/matches/73000000-0000-4000-8000-000000000001"],
    ["Account", "/account"],
  ] as const;
  return (
    <div className="customer-app">
      <aside>
        <Link className="brand" href="/today">
          VELYQ <small>STAGING</small>
        </Link>
        <p className="nav-label">INTELLIGENCE</p>
        <nav>
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
          <button type="submit">Sign out</button>
        </form>
      </aside>
      <main className="customer-main">
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
  return <span className={`status ${tone}`}>{children}</span>;
}
