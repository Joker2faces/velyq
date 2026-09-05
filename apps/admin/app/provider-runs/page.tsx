import Link from "next/link";
import { AdminShell, getAdminContext } from "../admin-page";

export const dynamic = "force-dynamic";

export default async function ProviderRunsPage() {
  const { runtime } = await getAdminContext("provider_runs.read");
  if (!runtime)
    return (
      <main className="auth-page">
        <div className="auth-card">
          <h1>Access denied.</h1>
          <p>Admin permission is required.</p>
          <Link href="/">Return to admin</Link>
        </div>
      </main>
    );
  try {
    const runs = await runtime.queries.listProviderRuns({
      limit: 100,
      cursor: null,
    });
    return (
      <AdminShell active="/provider-runs">
        <section className="page-heading">
          <p className="eyebrow">TRACE / PROVIDER</p>
          <h1>Provider runs</h1>
          <p>Replay identity, provenance, counts and downstream health.</p>
        </section>
        <section className="panel">
          <div className="table-wrap">
            <table>
              <caption className="sr-only">Provider runs</caption>
              <thead>
                <tr>
                  <th>Sequence</th>
                  <th>Status</th>
                  <th>Counts</th>
                  <th>Hashes</th>
                  <th>Started</th>
                  <th />
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
                    <td>
                      {run.acceptedCount} accepted / {run.rejectedCount}{" "}
                      rejected
                    </td>
                    <td>
                      <small>{run.sourceFixtureHash}</small>
                      <small>{run.normalizedOutputHash}</small>
                    </td>
                    <td>{run.startedAt}</td>
                    <td>
                      <Link href={`/provider-runs/${run.id}`}>
                        Open detail →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </AdminShell>
    );
  } finally {
    await runtime.close();
  }
}
