import type { ReactNode } from "react";
import { createDatabaseAdminRuntime } from "./database-admin";
import { cookies, headers } from "next/headers";

type HeaderStore = Readonly<{ get(name: string): string | null }>;
type CookieStore = Readonly<{ toString(): string }>;

export async function adminRequest(
  headerStore: HeaderStore,
  cookieStore: CookieStore,
) {
  const host = headerStore.get("host") ?? "localhost";
  return new Request(`https://${host}/`, {
    headers: { cookie: cookieStore.toString() },
  });
}

export async function getAdminContext() {
  const runtime = createDatabaseAdminRuntime();
  if (!runtime) return { runtime: null, authentication: null } as const;
  const authentication = await runtime.authenticator(
    await adminRequest(await headers(), await cookies()),
    crypto.randomUUID(),
  );
  if ("problem" in authentication) {
    await runtime.close();
    return { runtime: null, authentication } as const;
  }
  return { runtime, authentication } as const;
}

export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <div className="admin-app">
        <aside>
          <a className="brand" href="/">
            VELYQ <small>ADMIN</small>
          </a>
          <p className="nav-label">OPERATIONS</p>
          <nav aria-label="Admin navigation">
            <a href="/">Dashboard</a>
            <a href="/provider-runs">Provider runs</a>
            <a href="/predictions">Prediction traces</a>
            <a href="/scores">EDGE / RADAR</a>
            <a href="/audit">Audit log</a>
          </nav>
          <div className="side-note">
            Synthetic Phase 1 only
            <br />
            <span>READ ONLY // GOVERNED</span>
          </div>
          <form action="/api/v1/auth/sign-out" method="post">
            <button className="sign-out" type="submit">
              Sign out
            </button>
          </form>
        </aside>
        <main id="main-content" className="admin-main">
          <header>
            <span>PHASE 1 / ADMIN CONSOLE</span>
            <span className="live">● SERVER AUTHORIZED</span>
          </header>
          {children}
        </main>
      </div>
    </>
  );
}
