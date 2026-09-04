import Link from "next/link";
import { cookies, headers } from "next/headers";
import { createDatabaseAdminRuntime } from "./database-admin";
import { AdminShell, adminRequest } from "./admin-page";

export const dynamic = "force-dynamic";

export default async function Page() {
  const runtime = createDatabaseAdminRuntime();
  if (!runtime) return <Unavailable />;
  const authentication = await runtime.authenticator(
    await adminRequest(await headers(), await cookies()),
    crypto.randomUUID(),
  );
  if ("problem" in authentication) {
    await runtime.close();
    return <SignIn />;
  }
  try {
    const runs = await runtime.queries.listProviderRuns({
      limit: 8,
      cursor: null,
    });
    return (
      <AdminShell>
        <section className="hero">
          <p className="eyebrow">VELYQ // OPERATIONS</p>
          <h1>Traceability console.</h1>
          <p className="lede">
            Synthetic Phase 1 intelligence, governed from source run to customer
            result.
          </p>
          <div className="badges">
            <span>STAGING</span>
            <span>DEVELOPMENT HEURISTIC</span>
            <span>READ ONLY</span>
          </div>
        </section>
        <section className="summary-grid" aria-label="Operational summary">
          <article>
            <span>Provider runs</span>
            <strong>{runs.items.length}</strong>
            <small>latest visible page</small>
          </article>
          <article>
            <span>Data policy</span>
            <strong>GOVERNED</strong>
            <small>synthetic provenance required</small>
          </article>
          <article>
            <span>Access</span>
            <strong>ADMIN</strong>
            <small>server-side permission checks</small>
          </article>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">RECENT ACTIVITY</p>
              <h2>Provider runs</h2>
            </div>
            <Link href="/audit">Audit log →</Link>
          </div>
          <div className="table-wrap">
            <table>
              <caption className="sr-only">Recent provider runs</caption>
              <thead>
                <tr>
                  <th>Sequence</th>
                  <th>Status</th>
                  <th>Accepted</th>
                  <th>Rejected</th>
                  <th>Started</th>
                  <th>Trace</th>
                </tr>
              </thead>
              <tbody>
                {runs.items.map((run) => (
                  <tr key={run.id}>
                    <td>
                      <strong>{run.sequenceName}</strong>
                      <small>{run.providerCode}</small>
                    </td>
                    <td>
                      <span
                        className={`status status-${run.status.toLowerCase()}`}
                      >
                        {run.status}
                      </span>
                    </td>
                    <td>{run.acceptedCount}</td>
                    <td>{run.rejectedCount}</td>
                    <td>{run.startedAt}</td>
                    <td>
                      <Link href={`/provider-runs/${run.id}`}>Inspect →</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="link-grid" aria-label="Traceability views">
          <Link href="/audit">
            <strong>Audit</strong>
            <span>Immutable administrative activity</span>
          </Link>
          <Link href="/provider-runs">
            <strong>Provider runs</strong>
            <span>Hashes, counts, versions and errors</span>
          </Link>
          <Link href="/predictions">
            <strong>Prediction traces</strong>
            <span>Model, cutoff and source lineage</span>
          </Link>
          <Link href="/scores">
            <strong>EDGE / RADAR</strong>
            <span>Observable heuristic evidence</span>
          </Link>
        </section>
      </AdminShell>
    );
  } finally {
    await runtime.close();
  }
}

function SignIn() {
  return (
    <main className="auth-page">
      <div className="auth-card">
        <p className="eyebrow">VELYQ // ADMIN STAGING</p>
        <h1>Operations access.</h1>
        <p>
          Sign in with the existing Supabase identity. Authorization is resolved
          server-side.
        </p>
        <form action="/api/v1/auth/sign-in" method="post">
          <label htmlFor="email">
            Email
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </label>
          <label htmlFor="password">
            Password
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          <button type="submit">Continue to admin</button>
        </form>
        <small>Admin permission is required after authentication.</small>
      </div>
    </main>
  );
}
function Unavailable() {
  return (
    <main className="auth-page">
      <div className="auth-card">
        <p className="eyebrow">VELYQ // ADMIN STAGING</p>
        <h1>Authorization unavailable.</h1>
        <p>The admin database runtime is not configured. No data is shown.</p>
      </div>
    </main>
  );
}
