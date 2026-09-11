import Link from "next/link";
import { AdminShell, getAdminContext } from "../admin-page";

export const dynamic = "force-dynamic";

const reasonTotal = (reasons: Readonly<Record<string, number>>) =>
  Object.values(reasons).reduce((total, count) => total + count, 0);

const label = (value: string) => value.replaceAll("_", " ");

export default async function ProviderIngestionRunsPage() {
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
    const runs = await runtime.queries.listProviderIngestionRuns({
      limit: 100,
      cursor: null,
    });
    return (
      <AdminShell active="/provider-ingestion-runs">
        <section className="page-heading">
          <p className="eyebrow">OPERATIONS / LIVE PROVIDER</p>
          <h1>Live ingestion runs</h1>
          <p>
            Scheduler and manual polls from provider ingestion. A completed
            zero-call run is a healthy wake-up with no work due.
          </p>
        </section>
        <section className="panel">
          {runs.items.length ? (
            <div className="table-wrap">
              <table>
                <caption className="sr-only">
                  Live provider ingestion runs
                </caption>
                <thead>
                  <tr>
                    <th>Provider / trigger</th>
                    <th>Health / status</th>
                    <th>Provider calls</th>
                    <th>Attempts → writes</th>
                    <th>Skips / errors</th>
                    <th>Started / finished</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {runs.items.map((run) => (
                    <tr key={run.id}>
                      <td>
                        <strong>{run.providerCode}</strong>
                        <small>{run.trigger}</small>
                      </td>
                      <td>
                        <strong>{label(run.runHealth)}</strong>
                        <small>
                          {run.status} · result {label(run.resultOutcome)}
                        </small>
                      </td>
                      <td>{run.providerCallsUsed}</td>
                      <td>
                        <small>
                          Odds {run.odds.requestsAttempted} → {run.odds.written}
                        </small>
                        <small>
                          Lineups {run.lineups.requestsAttempted} →{" "}
                          {run.lineups.written}
                        </small>
                        <small>
                          Results {run.results.requestsAttempted} →{" "}
                          {run.results.written} · settlements{" "}
                          {run.results.settlementsWritten}
                        </small>
                      </td>
                      <td>
                        {reasonTotal(run.skippedByReason)} /{" "}
                        {reasonTotal(run.errorsByReason)}
                      </td>
                      <td>
                        <small>{run.startedAt}</small>
                        <small>{run.finishedAt ?? "Running"}</small>
                      </td>
                      <td>
                        <Link href={`/provider-ingestion-runs/${run.id}`}>
                          Diagnose →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="state">
              <h3>No live ingestion runs recorded</h3>
              <p>
                Replay provenance does not establish scheduler health. Check the
                scheduler target if this remains empty.
              </p>
            </div>
          )}
        </section>
        <p>
          Looking for fixture replays?{" "}
          <Link href="/provider-runs">Open replay provenance →</Link>
        </p>
      </AdminShell>
    );
  } finally {
    await runtime.close();
  }
}
