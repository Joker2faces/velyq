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
          <p className="eyebrow">TRACE / REPLAY</p>
          <h1>Replay provenance</h1>
          <p>
            Deterministic fixture replay identity, hashes, and normalization
            counts. These records do not represent live scheduler health.
          </p>
        </section>
        <section className="panel">
          <div className="table-wrap">
            <table>
              <caption className="sr-only">Replay provenance runs</caption>
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
